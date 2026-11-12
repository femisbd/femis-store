-- =====================================================================
-- Give someone access to the FEMIS admin panel.
--
-- Step 1: In Supabase, go to Authentication -> Users -> Add user -> Create new user.
--         Enter their email and a password, tick "Auto Confirm User", click Create.
-- Step 2: Change the email, name and role below, then run this in SQL Editor.
--         Roles: 'owner' (everything), 'orders' (confirm and manage orders),
--                'packing' (only marks confirmed orders as packed).
-- =====================================================================
insert into public.staff (user_id, name, role)
select id, 'Rakib', 'owner'            -- <- change name and role
from auth.users
where email = 'you@example.com';       -- <- change to their login email

-- To remove someone's access later (keeps their history):
-- update public.staff set active = false where user_id = (select id from auth.users where email = 'them@example.com');
