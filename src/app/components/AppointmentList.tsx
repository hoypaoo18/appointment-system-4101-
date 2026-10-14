import { useState } from "react";
import { ArrowLeft, Calendar, Clock, User, MapPin, Search, Filter, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface Appointment {
  id: string;
  title: string;
  type: 'academic-advising' | 'career-counseling' | 'office-hours' | 'tutoring' | 'admissions' | 'financial-aid';
  date: string;
  time: string;
  duration: number;
  instructor: string;
  location: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  notes?: string;
}

interface AppointmentListProps {
  onBack: () => void;
}

export function AppointmentList({ onBack }: AppointmentListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Mock appointment data
  const allAppointments: Appointment[] = [
    {
      id: '1',
      title: 'Academic Advising',
      type: 'academic-advising',
      date: '2025-09-29',
      time: '10:00 AM',
      duration: 30,
      instructor: 'Dr. Sarah Johnson',
      location: 'Academic Affairs Office 201',
      status: 'confirmed',
      notes: 'Discuss course selection for next semester'
    },
    {
      id: '2',
      title: 'Career Counseling',
      type: 'career-counseling',
      date: '2025-10-01',
      time: '2:30 PM',
      duration: 45,
      instructor: 'Ms. Emily Chen',
      location: 'Career Services Center',
      status: 'pending',
      notes: 'Review resume and discuss internship opportunities'
    },
    {
      id: '3',
      title: 'Math Tutoring',
      type: 'tutoring',
      date: '2025-10-03',
      time: '11:00 AM',
      duration: 60,
      instructor: 'Prof. Michael Davis',
      location: 'Math Learning Center',
      status: 'confirmed',
      notes: 'Help with calculus homework'
    },
    {
      id: '4',
      title: 'Office Hours',
      type: 'office-hours',
      date: '2025-09-25',
      time: '3:00 PM',
      duration: 20,
      instructor: 'Dr. Lisa Wang',
      location: 'Engineering Building 305',
      status: 'completed',
      notes: 'Discussed project requirements'
    },
    {
      id: '5',
      title: 'Admissions Consultation',
      type: 'admissions',
      date: '2025-09-28',
      time: '1:00 PM',
      duration: 30,
      instructor: 'Mr. Robert Kim',
      location: 'Admissions Office',
      status: 'cancelled',
      notes: 'Graduate program application review'
    },
    {
      id: '6',
      title: 'Financial Aid Meeting',
      type: 'financial-aid',
      date: '2025-10-05',
      time: '9:30 AM',
      duration: 45,
      instructor: 'Ms. Jennifer Lopez',
      location: 'Financial Aid Office',
      status: 'confirmed',
      notes: 'Review scholarship applications'
    }
  ];

  const appointmentTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'academic-advising', label: 'Academic Advising' },
    { value: 'career-counseling', label: 'Career Counseling' },
    { value: 'office-hours', label: 'Office Hours' },
    { value: 'tutoring', label: 'Tutoring' },
    { value: 'admissions', label: 'Admissions' },
    { value: 'financial-aid', label: 'Financial Aid' }
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'completed', label: 'Completed' }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    const typeObj = appointmentTypes.find(t => t.value === type);
    return typeObj ? typeObj.label : type;
  };

  const filteredAppointments = allAppointments.filter(appointment => {
    const matchesSearch = 
      appointment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.instructor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
    const matchesType = typeFilter === 'all' || appointment.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const upcomingAppointments = filteredAppointments.filter(apt => 
    new Date(apt.date) >= new Date() && apt.status !== 'cancelled'
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const pastAppointments = filteredAppointments.filter(apt => 
    new Date(apt.date) < new Date() || apt.status === 'completed' || apt.status === 'cancelled'
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const AppointmentRow = ({ appointment }: { appointment: Appointment }) => (
    <TableRow>
      <TableCell>
        <div>
          <div className="font-medium">{appointment.title}</div>
          <div className="text-sm text-muted-foreground">{getTypeLabel(appointment.type)}</div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{new Date(appointment.date).toLocaleDateString()}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{appointment.time}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{appointment.instructor}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="truncate max-w-[150px]">{appointment.location}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge className={getStatusColor(appointment.status)}>
          {appointment.status}
        </Badge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
              <>
                <DropdownMenuItem>
                  <Edit className="mr-2 h-4 w-4" />
                  Reschedule
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancel
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1>All Appointments</h1>
          <p className="text-muted-foreground">View and manage all your appointments</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search appointments, instructors, or locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {appointmentTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Appointments Table */}
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingAppointments.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Past ({pastAppointments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Appointments</CardTitle>
              <CardDescription>
                Your scheduled appointments that haven't occurred yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingAppointments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Appointment</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Instructor</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingAppointments.map(appointment => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No upcoming appointments found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="past">
          <Card>
            <CardHeader>
              <CardTitle>Past Appointments</CardTitle>
              <CardDescription>
                Your completed, cancelled, or past appointments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pastAppointments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Appointment</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Instructor</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastAppointments.map(appointment => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No past appointments found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}