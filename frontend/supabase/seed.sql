insert into public.users (id, name, email)
values
  (1, 'Michael Robinson', 'michael.robinson@gmail.com')
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email;

select setval(
  pg_get_serial_sequence('public.users', 'id'),
  coalesce((select max(id) from public.users), 1),
  true
);

insert into public.notes (user_id, title, content, category, tags, pinned, editor_mode, created_at)
values
  (1, 'Q1 Strategy Notes', '# Q1 Goals\n\n- Reviewed roadmap priorities\n- Finalized launch milestones', 'project', array['roadmap','planning'], true, 'markdown', now() - interval '1 day'),
  (1, 'Marketing Sync', 'Aligned campaign goals and revised paid acquisition plan.', 'meeting', array['marketing','analytics'], false, 'rich', now() - interval '2 day'),
  (1, 'Product Feedback', 'Collected onboarding friction points from beta users.', 'idea', array['dashboard','ux'], false, 'rich', now() - interval '3 day'),
  (1, 'Hiring Debrief', 'Summarized interview panel decisions for design role.', 'meeting', array['hiring','team'], true, 'rich', now() - interval '5 day');

insert into public.tasks (title, status, user_id, created_at)
values
  ('Finalize dashboard design', 'done', 1, now() - interval '1 day'),
  ('Prepare analytics review', 'done', 1, now() - interval '2 day'),
  ('Write launch checklist', 'todo', 1, now() - interval '1 day'),
  ('Update sales report', 'todo', 1, now() - interval '3 day'),
  ('Review AI prompts', 'done', 1, now() - interval '4 day'),
  ('Clean notes archive', 'todo', 1, now() - interval '6 day');

insert into public.sales (product, price, customer, date)
values
  ('Pro Plan', 499.00, 'Liam Smith', now() - interval '1 day'),
  ('AI Add-on', 299.00, 'Lily Thompson', now() - interval '2 day'),
  ('Team Seats', 799.00, 'Lucas Young', now() - interval '3 day'),
  ('Consulting Pack', 1299.00, 'Amelia Davis', now() - interval '4 day'),
  ('Pro Plan', 499.00, 'Robert Johnson', now() - interval '5 day');

insert into public.products (name, price, stock)
values
  ('Pro Plan', 499.00, 84),
  ('AI Add-on', 299.00, 46),
  ('Team Seats', 799.00, 21),
  ('Consulting Pack', 1299.00, 74)
on conflict do nothing;

select setval(
  pg_get_serial_sequence('public.notes', 'id'),
  coalesce((select max(id) from public.notes), 1),
  true
);

select setval(
  pg_get_serial_sequence('public.tasks', 'id'),
  coalesce((select max(id) from public.tasks), 1),
  true
);

select setval(
  pg_get_serial_sequence('public.sales', 'id'),
  coalesce((select max(id) from public.sales), 1),
  true
);

select setval(
  pg_get_serial_sequence('public.products', 'id'),
  coalesce((select max(id) from public.products), 1),
  true
);
