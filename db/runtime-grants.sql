-- Apply as the migration owner on the explicitly selected Our Jam branch.
-- Create our_jam_app separately with SQL and a generated private password.
-- Neon API-created roles inherit administrative privileges; do not use one as the runtime login.
GRANT CONNECT ON DATABASE neondb TO our_jam_app;
GRANT USAGE ON SCHEMA public TO our_jam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO our_jam_app;
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM our_jam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO our_jam_app;
-- Reapply after adding tables. This login must not own the schema/tables,
-- have CREATE on public, or belong to neon_superuser. It cannot migrate.
