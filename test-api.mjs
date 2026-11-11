// Test the contagion validation business rule end-to-end.
const BASE = 'http://localhost:5000';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

console.log('=== Test 1: Contagious patient -> non-isolation room (ICU-102) — MUST REJECT ===');
let r = await post('/api/admissions', {
  first_name: 'Test', last_name: 'Contagious',
  medical_case: 'Influenza', is_contagious: true, room_id: 2
});
console.log(`  Status: ${r.status} (expected 409)`);
console.log(`  Error: ${r.data.error || '(none)'}`);
console.log(`  ${r.status === 409 ? 'PASS ✓' : 'FAIL ✗'}`);

console.log('\n=== Test 2: Contagious patient -> Isolation room (ISO-502) — MUST ACCEPT ===');
r = await post('/api/admissions', {
  first_name: 'Carlos', last_name: 'Sy',
  medical_case: 'COVID-19', is_contagious: true, room_id: 9
});
console.log(`  Status: ${r.status} (expected 201)`);
console.log(`  Result: ${JSON.stringify(r.data)}`);
console.log(`  ${r.status === 201 ? 'PASS ✓' : 'FAIL ✗'}`);

console.log('\n=== Test 3: Non-contagious patient -> regular room (SEMI-301) — MUST ACCEPT ===');
r = await post('/api/admissions', {
  first_name: 'Juan', last_name: 'Dela Cruz',
  medical_case: 'Hypertension', is_contagious: false, room_id: 5
});
console.log(`  Status: ${r.status} (expected 201)`);
console.log(`  Result: ${JSON.stringify(r.data)}`);
console.log(`  ${r.status === 201 ? 'PASS ✓' : 'FAIL ✗'}`);

console.log('\n=== Test 4: Verify ISO-502 is now full (Carlos took the last bed) ===');
const rooms = await get('/api/rooms?type=Isolation');
rooms.forEach(room => {
  console.log(`  ${room.room_number}: ${room.current_occupancy}/${room.bed_capacity} beds, status=${room.status}`);
});

console.log('\n=== Test 5: Contagious patient -> full Isolation room (ISO-502) — MUST REJECT ===');
r = await post('/api/admissions', {
  first_name: 'Another', last_name: 'Contagious',
  medical_case: 'Measles', is_contagious: true, room_id: 9
});
console.log(`  Status: ${r.status} (expected 409)`);
console.log(`  Error: ${r.data.error || '(none)'}`);
console.log(`  ${r.status === 409 ? 'PASS ✓' : 'FAIL ✗'}`);

console.log('\n=== Test 6: Amenity filter — rooms with aircon only ===');
const airconRooms = await get('/api/rooms?aircon=1');
console.log(`  Found ${airconRooms.length} rooms with aircon`);
airconRooms.forEach(room => console.log(`    ${room.room_number} (${room.type_name}) has_aircon=${room.has_aircon}`));

console.log('\n=== All tests complete ===');
