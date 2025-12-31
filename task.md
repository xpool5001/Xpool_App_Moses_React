# Task List

- [/] **Google Maps Integration**
    - [ ] Create `.env` file with `VITE_GOOGLE_MAPS_API_KEY`.
    - [ ] Uninstall Leaflet dependencies (`leaflet`, `react-leaflet`, `leaflet-routing-machine`).
    - [ ] Install Google Maps dependencies (`@vis.gl/react-google-maps`).
    - [ ] Refactor `PassengerHome.jsx` to use Google Maps.
- [ ] **State Persistence (Backend Sync)**
    - [ ] Create SQL migration for `profiles` table (add `last_screen` column).
    - [ ] Update `App.jsx` to fetch and sync `currentScreen` with Supabase.
    - [ ] Ensure persistence works for both Driver and Passenger roles.
- [ ] **Workflow Completion**
    - [ ] Verify connection between Driver Publishing and Passenger Booking.
    - [ ] Document the complete unified workflow.
