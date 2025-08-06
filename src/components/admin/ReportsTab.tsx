import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, FileText, Users, Building, DollarSign, TrendingUp, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';


interface Registration {
  id: string;
  customer_id: string;
  full_name: string;
  mobile_number: string;
  address: string;
  ward: string;
  agent: string;
  status: string;
  fee: number;
  created_at: string;
  approved_date: string;
  approved_by: string;
  expiry_date: string;
  category_id: string;
  preference_category_id?: string;
  panchayath_id?: string;
  categories: {
    name_english: string;
    name_malayalam: string;
  };
  preference_categories?: {
    name_english: string;
    name_malayalam: string;
  };
  panchayaths?: {
    name: string;
    district: string;
  };
}

interface Verification {
  registration_id: string;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  restored_by: string | null;
  restored_at: string | null;
}

const ReportsTab = () => {
  const { currentAdminName } = useAdminAuth();
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  const [verifications, setVerifications] = useState<Record<string, Verification>>({});

  useEffect(() => {
    fetchRegistrations();
    fetchPendingRegistrations();
  }, []);

  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          *,
          categories:categories!registrations_category_id_fkey (name_english, name_malayalam),
          preference_categories:categories!registrations_preference_category_id_fkey (name_english, name_malayalam),
          panchayaths:panchayaths!registrations_panchayath_id_fkey (name, district)
        `)
        .eq('status', 'approved')
        .order('approved_date', { ascending: false });

      if (error) {
        console.error('Error fetching registrations:', error);
        toast.error('Error fetching registrations');
      } else {
        const regs = (data as unknown as Registration[]) || [];
        setRegistrations(regs);
        const ids = regs.map((r) => r.id);
        if (ids.length > 0) {
          await loadVerifications(ids);
        } else {
          setVerifications({});
        }
      }
    } catch (error) {
      console.error('Error fetching registrations:', error);
      toast.error('Error fetching registrations');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingRegistrations = async () => {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          *,
          categories:categories!registrations_category_id_fkey (name_english, name_malayalam),
          preference_categories:categories!registrations_preference_category_id_fkey (name_english, name_malayalam),
          panchayaths:panchayaths!registrations_panchayath_id_fkey (name, district)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending registrations:', error);
      } else {
        setPendingRegistrations(data as unknown as Registration[] || []);
      }
    } catch (error) {
      console.error('Error fetching pending registrations:', error);
    }
  };

  const loadVerifications = async (registrationIds: string[]) => {
    try {
      const { data, error } = await (supabase as any)
        .from('registration_verifications')
        .select('*')
        .in('registration_id', registrationIds);

      if (error) {
        console.error('Error fetching verifications:', error);
        return;
      }

      const map: Record<string, Verification> = {};
      (data || []).forEach((row: any) => {
        map[row.registration_id] = row as Verification;
      });
      setVerifications(map);
    } catch (err) {
      console.error('Error fetching verifications:', err);
    }
  };


  const submitVerify = async (registration: Registration) => {
    if (!currentAdminName) return;
    try {
      const payload = {
        registration_id: registration.id,
        verified: true,
        verified_by: currentAdminName,
        verified_at: new Date().toISOString(),
        restored_by: null,
        restored_at: null,
      };

      const { error } = await (supabase as any)
        .from('registration_verifications')
        .upsert(payload, { onConflict: 'registration_id' });

      if (error) {
        console.error('Verification failed:', error);
        // 42P01 = undefined_table
        if ((error as any).code === '42P01') {
          toast.error('Database table missing: registration_verifications. Please run the setup SQL in Supabase.');
        } else {
          toast.error('Failed to verify');
        }
        return;
      }

      setVerifications((prev) => ({ ...prev, [registration.id]: payload as Verification }));
      toast.success('Verified successfully');
    } catch (err) {
      console.error('Verification failed:', err);
      toast.error('Failed to verify');
    }
  };

  const submitRestore = async (registration: Registration) => {
    if (!currentAdminName) return;
    try {
      const payload = {
        registration_id: registration.id,
        verified: false,
        verified_by: null,
        verified_at: null,
        restored_by: currentAdminName,
        restored_at: new Date().toISOString(),
      };

      const { error } = await (supabase as any)
        .from('registration_verifications')
        .upsert(payload, { onConflict: 'registration_id' });

      if (error) {
        console.error('Restore failed:', error);
        if ((error as any).code === '42P01') {
          toast.error('Database table missing: registration_verifications. Please run the setup SQL in Supabase.');
        } else {
          toast.error('Failed to restore');
        }
        return;
      }

      setVerifications((prev) => ({ ...prev, [registration.id]: payload as Verification }));
      toast.success('Restored successfully');
    } catch (err) {
      console.error('Restore failed:', err);
      toast.error('Failed to restore');
    }
  };

  const isRangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  // Filter registrations by date range and exclude free registrations
  const filteredRegistrations = registrations.filter(registration => {
    // Only include paid registrations (exclude free registrations where fee is 0 or null)
    const isPaidRegistration = registration.fee !== null && registration.fee > 0;
    if (!isPaidRegistration) return false;
    
    // If no dates are selected, return all paid registrations
    if (!fromDate && !toDate) return true;
    if (isRangeInvalid) return false;
    
    const registrationDate = registration.approved_date ? new Date(registration.approved_date) : null;
    if (!registrationDate) return false;

    const fromDateTime = fromDate ? startOfDay(fromDate) : null;
    const toDateTime = toDate ? endOfDay(toDate) : null;

    if (fromDateTime && toDateTime) {
      return isWithinInterval(registrationDate, { start: fromDateTime, end: toDateTime });
    } else if (fromDateTime) {
      return registrationDate >= fromDateTime;
    } else if (toDateTime) {
      return registrationDate <= toDateTime;
    }
    
    return false;
  });

  // Calculate metrics based on filtered data
  const totalRegistrations = filteredRegistrations.length;
  const totalFeesCollected = filteredRegistrations.reduce((sum, reg) => sum + (reg.fee || 0), 0);
  const totalCategories = [...new Set(filteredRegistrations.map(reg => reg.category_id))].length;
  const totalPanchayaths = [...new Set(filteredRegistrations.map(reg => reg.panchayath_id))].filter(Boolean).length;
  const pendingAmount = pendingRegistrations.reduce((sum, reg) => sum + (reg.fee || 0), 0);

  const handleClear = () => {
    setFromDate(undefined);
    setToDate(undefined);
  };

  const handleExportExcel = () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both From and To dates to export');
      return;
    }
    if (isRangeInvalid) {
      toast.error('Invalid date range: From date must be before or equal to To date');
      return;
    }
    // Export logic for Excel
    console.log('Exporting to Excel...', filteredRegistrations);
    toast.success('Export Excel functionality to be implemented');
  };

  const handleExportPDF = () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both From and To dates to export');
      return;
    }
    if (isRangeInvalid) {
      toast.error('Invalid date range: From date must be before or equal to To date');
      return;
    }
    // Export logic for PDF
    console.log('Exporting to PDF...', filteredRegistrations);
    toast.success('Export PDF functionality to be implemented');
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Date Range Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>From:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-40 justify-start text-left font-normal",
                      !fromDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(date) => {
                      if (date && toDate && date > toDate) {
                        toast.error('From date cannot be after To date');
                        return;
                      }
                      setFromDate(date);
                    }}
                    disabled={(date) => !!toDate && date > toDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="flex items-center gap-2">
              <Label>To:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-40 justify-start text-left font-normal",
                      !toDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(date) => {
                      if (date && fromDate && date < fromDate) {
                        toast.error('To date cannot be before From date');
                        return;
                      }
                      setToDate(date);
                    }}
                    disabled={(date) => !!fromDate && date < fromDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-2 ml-auto">
              <Button 
                variant="destructive" 
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          </div>

           {isRangeInvalid && (
             <p className="text-sm text-destructive text-center mb-2">
               Invalid date range: From must be earlier than or equal to To.
             </p>
           )}
           <p className="text-center text-sm text-muted-foreground">
              Filters only paid registrations (excludes free registrations)
            </p>
        </CardContent>
      </Card>

      {/* Dashboard Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">Total Registrations</span>
            </div>
            <div className="text-2xl font-bold">{totalRegistrations}</div>
            <p className="text-xs text-muted-foreground">Filtered by date range</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Building className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium">Total Categories</span>
            </div>
            <div className="text-2xl font-bold">{totalCategories}</div>
            <p className="text-xs text-muted-foreground">In filtered data</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Building className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">Total Panchayaths</span>
            </div>
            <div className="text-2xl font-bold">{totalPanchayaths}</div>
            <p className="text-xs text-muted-foreground">In filtered data</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">Total Fees Collected</span>
            </div>
            <div className="text-2xl font-bold text-green-600">₹{totalFeesCollected.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Filtered by date range</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium">Pending Amount</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">₹{pendingAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total pending fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">Performance</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {totalRegistrations > 50 ? 'Excellent' : totalRegistrations > 20 ? 'Good' : 'Fair'}
            </div>
            <p className="text-xs text-muted-foreground">Active registrations</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Reports */}
      <div className="space-y-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-green-800">Active Panchayath Report</h3>
                <p className="text-sm text-green-600">Performance grading based on registrations and revenue collection</p>
              </div>
              <ChevronRight className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-blue-800">Category Performance Report</h3>
                <p className="text-sm text-blue-600">Total fee collected and registration count for each category</p>
              </div>
              <ChevronRight className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-yellow-800">Panchayath Performance Report</h3>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleExportExcel} disabled={isRangeInvalid || !fromDate || !toDate}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleExportPDF} disabled={isRangeInvalid || !fromDate || !toDate}>
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approved Registrations Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Paid Approved Registrations in Date Range ({filteredRegistrations.length})</CardTitle>
            <div className="flex gap-2">
              <Button onClick={handleExportExcel} variant="outline" size="sm" disabled={isRangeInvalid || !fromDate || !toDate}>
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button onClick={handleExportPDF} variant="outline" size="sm" disabled={isRangeInvalid || !fromDate || !toDate}>
                <FileText className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isRangeInvalid ? (
            <div className="text-center py-8">
              <p className="text-destructive">Invalid date range selected. Please correct From/To.</p>
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {(!fromDate && !toDate) 
                  ? "Please select date range to view approved registrations."
                  : "No approved registrations found in the selected date range."
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Mobile Number</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Fee Paid</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead>Approved Date</TableHead>
                  <TableHead>Verification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRegistrations.map((registration) => {
                  const v = verifications[registration.id];
                  const verifiedAt = v?.verified_at ? new Date(v.verified_at) : null;
                  return (
                    <TableRow key={registration.id}>
                      <TableCell className="font-medium">{registration.full_name}</TableCell>
                      <TableCell>{registration.mobile_number}</TableCell>
                      <TableCell className="max-w-md">
                        {registration.categories?.name_english || 'N/A'}
                      </TableCell>
                      <TableCell>₹{registration.fee || 0}</TableCell>
                      <TableCell>{registration.approved_by || 'N/A'}</TableCell>
                      <TableCell>
                        {registration.approved_date 
                          ? format(new Date(registration.approved_date), 'dd/MM/yyyy')
                          : 'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        {v?.verified ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">Verified</Badge>
                            <span className="text-sm text-muted-foreground">
                              {v.verified_by || 'N/A'} • {verifiedAt ? format(verifiedAt, 'dd/MM/yyyy HH:mm') : 'N/A'}
                            </span>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => submitRestore(registration)}
                              disabled={!currentAdminName}
                            >
                              Restore as {currentAdminName || 'Unknown'}
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            onClick={() => submitVerify(registration)}
                            disabled={!currentAdminName}
                          >
                            Verify as {currentAdminName || 'Unknown'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default ReportsTab;