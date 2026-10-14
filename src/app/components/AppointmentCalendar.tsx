import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, Clock, User, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

interface CalendarAppointment {
  id: string;
  title: string;
  type: 'academic-advising' | 'career-counseling' | 'office-hours' | 'tutoring' | 'admissions';
  date: string;
  time: string;
  duration: number;
  instructor: string;
  location: string;
  status: 'confirmed' | 'pending' | 'cancelled';
}

interface AppointmentCalendarProps {
  onBack: () => void;
}

export function AppointmentCalendar({ onBack }: AppointmentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Mock appointment data
  const appointments: CalendarAppointment[] = [
    {
      id: '1',
      title: 'Academic Advising',
      type: 'academic-advising',
      date: '2025-09-29',
      time: '10:00 AM',
      duration: 30,
      instructor: 'Dr. Sarah Johnson',
      location: 'Academic Affairs Office 201',
      status: 'confirmed'
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
      status: 'pending'
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
      status: 'confirmed'
    },
    {
      id: '4',
      title: 'Office Hours',
      type: 'office-hours',
      date: '2025-10-05',
      time: '3:00 PM',
      duration: 20,
      instructor: 'Dr. Lisa Wang',
      location: 'Engineering Building 305',
      status: 'confirmed'
    }
  ];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const getAppointmentsForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.filter(apt => apt.date === dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const selectedDateAppointments = selectedDate ? appointments.filter(apt => apt.date === selectedDate) : [];

  const days = getDaysInMonth(currentDate);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1>Calendar View</h1>
          <p className="text-muted-foreground">View and manage your appointments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {daysOfWeek.map(day => (
                  <div key={day} className="p-2 text-center font-medium text-sm text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  if (day === null) {
                    return <div key={index} className="p-2 h-24"></div>;
                  }
                  
                  const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayAppointments = getAppointmentsForDate(day);
                  const isSelected = selectedDate === dateStr;
                  const isToday = dateStr === new Date().toISOString().split('T')[0];
                  
                  return (
                    <div
                      key={day}
                      className={`p-2 h-24 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                        isSelected ? 'bg-primary/10 border-primary' : 
                        isToday ? 'bg-blue-50 border-blue-200' : 'border-border'
                      }`}
                      onClick={() => setSelectedDate(dateStr)}
                    >
                      <div className={`text-sm ${isToday ? 'font-semibold text-blue-600' : ''}`}>
                        {day}
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayAppointments.slice(0, 2).map(apt => (
                          <div key={apt.id} className={`text-xs p-1 rounded text-center truncate ${getStatusColor(apt.status)}`}>
                            {apt.time.split(' ')[0]}
                          </div>
                        ))}
                        {dayAppointments.length > 2 && (
                          <div className="text-xs text-muted-foreground text-center">
                            +{dayAppointments.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Appointment Details */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedDate ? 
                  `Appointments for ${new Date(selectedDate).toLocaleDateString()}` : 
                  'Select a Date'
                }
              </CardTitle>
              <CardDescription>
                {selectedDateAppointments.length > 0 ? 
                  `${selectedDateAppointments.length} appointment${selectedDateAppointments.length > 1 ? 's' : ''}` :
                  selectedDate ? 'No appointments scheduled' : 'Click on a date to view appointments'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDateAppointments.length > 0 ? (
                <div className="space-y-4">
                  {selectedDateAppointments.map(apt => (
                    <div key={apt.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <h3 className="font-medium">{apt.title}</h3>
                        <Badge className={getStatusColor(apt.status)}>
                          {apt.status}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{apt.time} ({apt.duration} min)</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{apt.instructor}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{apt.location}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm">
                          Reschedule
                        </Button>
                        <Button variant="destructive" size="sm">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedDate ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No appointments scheduled for this date</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Click on a date to view appointments</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}