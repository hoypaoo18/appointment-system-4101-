import { useState } from "react";
import { ArrowLeft, Calendar, Clock, MapPin, User } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Calendar as CalendarComponent } from "./ui/calendar";
import { Badge } from "./ui/badge";

interface AppointmentBookingProps {
  onBack: () => void;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Instructor {
  id: string;
  name: string;
  title: string;
  department: string;
  availability: string[];
}

export function AppointmentBooking({ onBack }: AppointmentBookingProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [appointmentType, setAppointmentType] = useState<string>("");
  const [selectedInstructor, setSelectedInstructor] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Mock data
  const appointmentTypes = [
    { value: 'academic-advising', label: 'Academic Advising', duration: '30 min' },
    { value: 'career-counseling', label: 'Career Counseling', duration: '45 min' },
    { value: 'office-hours', label: 'Office Hours', duration: '20 min' },
    { value: 'tutoring', label: 'Tutoring Session', duration: '60 min' },
    { value: 'admissions', label: 'Admissions Consultation', duration: '30 min' },
    { value: 'financial-aid', label: 'Financial Aid Consultation', duration: '45 min' }
  ];

  const instructors: Instructor[] = [
    {
      id: '1',
      name: 'Dr. Sarah Johnson',
      title: 'Academic Advisor',
      department: 'Student Services',
      availability: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM']
    },
    {
      id: '2',
      name: 'Ms. Emily Chen',
      title: 'Career Counselor',
      department: 'Career Services',
      availability: ['10:30 AM', '1:00 PM', '2:30 PM', '4:00 PM']
    },
    {
      id: '3',
      name: 'Prof. Michael Davis',
      title: 'Mathematics Professor',
      department: 'Mathematics',
      availability: ['11:00 AM', '1:30 PM', '3:00 PM', '4:30 PM']
    }
  ];

  const timeSlots: TimeSlot[] = [
    { time: '9:00 AM', available: true },
    { time: '9:30 AM', available: false },
    { time: '10:00 AM', available: true },
    { time: '10:30 AM', available: true },
    { time: '11:00 AM', available: true },
    { time: '11:30 AM', available: false },
    { time: '1:00 PM', available: true },
    { time: '1:30 PM', available: true },
    { time: '2:00 PM', available: true },
    { time: '2:30 PM', available: true },
    { time: '3:00 PM', available: true },
    { time: '3:30 PM', available: false },
    { time: '4:00 PM', available: true },
    { time: '4:30 PM', available: true }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle appointment booking logic here
    console.log({
      date: selectedDate,
      time: selectedTime,
      type: appointmentType,
      instructor: selectedInstructor,
      notes
    });
    alert('Appointment request submitted! You will receive a confirmation email shortly.');
    onBack();
  };

  const selectedAppointmentType = appointmentTypes.find(type => type.value === appointmentType);
  const selectedInstructorData = instructors.find(inst => inst.id === selectedInstructor);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1>Book an Appointment</h1>
          <p className="text-muted-foreground">Schedule a meeting with faculty or staff</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Form */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Appointment Details</CardTitle>
                <CardDescription>Select the type and purpose of your appointment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="appointment-type">Appointment Type</Label>
                  <Select value={appointmentType} onValueChange={setAppointmentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select appointment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {appointmentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center justify-between w-full">
                            <span>{type.label}</span>
                            <Badge variant="secondary" className="ml-2">{type.duration}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="instructor">Instructor/Staff Member</Label>
                  <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select instructor or staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {instructors.map((instructor) => (
                        <SelectItem key={instructor.id} value={instructor.id}>
                          <div>
                            <div>{instructor.name}</div>
                            <div className="text-sm text-muted-foreground">{instructor.title} - {instructor.department}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Please describe the purpose of your appointment or any specific topics you'd like to discuss..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
              </CardContent>
            </Card>

            {selectedAppointmentType && selectedInstructorData && (
              <Card>
                <CardHeader>
                  <CardTitle>Appointment Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedInstructorData.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedAppointmentType.label} ({selectedAppointmentType.duration})</span>
                    </div>
                    {selectedDate && selectedTime && (
                      <>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedDate.toLocaleDateString()} at {selectedTime}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>Location will be provided in confirmation email</span>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Calendar and Time Slots */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Date</CardTitle>
                <CardDescription>Choose your preferred date</CardDescription>
              </CardHeader>
              <CardContent>
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date() || date.getDay() === 0 || date.getDay() === 6}
                  className="rounded-md border w-full"
                />
              </CardContent>
            </Card>

            {selectedDate && (
              <Card>
                <CardHeader>
                  <CardTitle>Available Time Slots</CardTitle>
                  <CardDescription>
                    {selectedDate.toLocaleDateString()} - Select your preferred time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {timeSlots.map((slot) => (
                      <Button
                        key={slot.time}
                        type="button"
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className="justify-center"
                      >
                        {slot.time}
                      </Button>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Gray slots are unavailable. All times are in your local timezone.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={!selectedDate || !selectedTime || !appointmentType || !selectedInstructor}
          >
            Book Appointment
          </Button>
        </div>
      </form>
    </div>
  );
}