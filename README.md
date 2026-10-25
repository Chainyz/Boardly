# Boardly

A colourful collaborative whiteboard starter app built with React, Vite and Supabase, ready to deploy on Railway.

## Features
- Add editable text boxes and sticky notes
- Upload images and move/resize board items
- Share a board using its URL (`?board=...`)
- Supabase persistence and Realtime updates when configured
- Responsive layout for desktop and mobile

## 1. Create a Supabase project
Create a project at https://supabase.com, open **SQL Editor**, and run all of `supabase.sql`.

Then open **Project Settings → API** and copy the Project URL and anon/public key.

## 2. Configure environment variables
In Railway, add:
- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key

These variables are embedded into the frontend at build time. Set them before deployment/redeploy after changing them. Never use a Supabase service-role key in the frontend.

## 3. Put the project on GitHub
Create a new repository named `boardly`, upload all files in this folder, and commit them to the default branch.

## 4. Deploy on Railway
In Railway, create a new project → deploy from GitHub repo → select `boardly`.
Railway will build with the included Dockerfile. Add a public domain in the service's Networking settings.

## Important security note
This starter config is intentionally set up for easy link-based collaboration. Anyone who knows a board ID can read/edit that board, and image uploads are public. Do not use it for confidential or sensitive material. Before public launch, add authenticated membership/invite controls, rate limits and stronger per-board authorization. The UI's link-sharing dialog is not an access-control system by itself.
