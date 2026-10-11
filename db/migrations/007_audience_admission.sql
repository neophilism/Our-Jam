ALTER TABLE events ADD COLUMN room_code_hash text;
ALTER TABLE events ADD COLUMN room_code_salt text;
ALTER TABLE event_members ADD COLUMN venue_admitted boolean NOT NULL DEFAULT false;
CREATE INDEX event_admitted_members ON event_members(event_id) WHERE venue_admitted;
