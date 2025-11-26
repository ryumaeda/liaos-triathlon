-- 初期チームデータ挿入
insert into teams (name)
values 
  ('チームA'),
  ('チームB'),
  ('チームC')
on conflict (name) do nothing;
