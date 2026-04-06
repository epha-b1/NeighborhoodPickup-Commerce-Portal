-- Enforce that every pickup window is exactly 1 hour (60 minutes).
-- Uses TIMEDIFF which returns a TIME value; '01:00:00' == 60 minutes.
ALTER TABLE pickup_windows
  ADD CONSTRAINT chk_pickup_window_1h_duration
    CHECK (TIMEDIFF(end_time, start_time) = '01:00:00');
