import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleDefaults,validateSchedule,checkSchedule} from '../server/scheduling.mjs';
test('Executive policies reject closed dates, breaks and out-of-hours bookings',()=>{
 const p={...structuredClone(scheduleDefaults),workingDays:[1,2,3,4,5],breaks:[{startTime:'12:00',endTime:'13:00'}],unavailableDates:['2030-01-07']};
 const a={date:'2030-01-08',startTime:'11:30',duration:30};
 assert.doesNotThrow(()=>checkSchedule(a,validateSchedule(p)));
 assert.throws(()=>checkSchedule({...a,duration:45},p),/break/);
 assert.throws(()=>checkSchedule({...a,date:'2030-01-07'},p),/unavailable/);
 assert.throws(()=>checkSchedule({...a,date:'2030-01-06'},p),/unavailable/);
 assert.throws(()=>checkSchedule({...a,startTime:'17:45'},p),/working hours/);
 assert.throws(()=>validateSchedule({...p,bufferMinutes:-1}),/buffer/);
 assert.throws(()=>validateSchedule({...p,unavailableDates:['2030-02-30']}),/dates/);
});
