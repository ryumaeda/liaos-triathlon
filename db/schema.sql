-- teams テーブル定義
create table if not exists teams (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default timezone('utc'::text, now()),
  name text not null unique
);

-- scores テーブル定義
create table if not exists scores (
  id bigint generated always as identity primary key,
  game_name text not null,
  team_id bigint not null references teams(id) on delete cascade,
  score integer not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);
