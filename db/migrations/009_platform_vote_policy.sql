CREATE TABLE platform_vote_policy (
 id integer PRIMARY KEY CHECK(id=1),
 mode text NOT NULL CHECK(mode IN ('fixed','artist')),
 fixed_votes integer NOT NULL CHECK(fixed_votes BETWEEN 1 AND 1000),
 min_votes integer NOT NULL CHECK(min_votes BETWEEN 1 AND 1000),
 max_votes integer NOT NULL CHECK(max_votes BETWEEN 1 AND 1000),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(min_votes<=max_votes)
);
INSERT INTO platform_vote_policy(id,mode,fixed_votes,min_votes,max_votes) VALUES(1,'fixed',5,3,20);
CREATE TABLE IF NOT EXISTS platform_admin_sessions (
 token_hash text PRIMARY KEY,
 expires_at timestamptz NOT NULL
);
CREATE INDEX platform_admin_sessions_expiry ON platform_admin_sessions(expires_at);
CREATE TABLE platform_policy_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 action text NOT NULL,
 previous_policy jsonb,
 updated_policy jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
