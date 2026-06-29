# Appointment Booking Agent Benchmark

Build a voice agent pathway for a dental office appointment-booking flow.

The agent must:

- Greet the caller and identify whether they want a new appointment, a reschedule, or a cancellation.
- Collect patient name, phone number, appointment reason, preferred date, and preferred time window.
- Check availability through a planned tool surface, even if the lab implementation only stubs the tool.
- Confirm the appointment details back to the caller.
- Handle callers who are unsure, ask for pricing, or need a human transfer.
- End the call politely once the booking or handoff outcome is complete.

Expected pathway shape:

- At least 5 nodes.
- At least 4 transitions.
- Clear separation between intake, qualification, availability, confirmation, and handoff/end states.
- Variables for name, phone, reason, preferred date, and preferred time.
- A test scenario for a caller booking a cleaning next Tuesday afternoon.

Evaluation question:

Does this workflow let Claude create a pathway that is as complete, valid, and testable as the existing Blandcode `super_norm` agent?
