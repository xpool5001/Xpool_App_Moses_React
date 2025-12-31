-- XPOOL COMPREHENSIVE BACKEND SCHEMA
-- Includes Tables, Enums, RLS Policies, Triggers, and Functions

-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'admin');
CREATE TYPE trip_status AS ENUM ('active', 'in_progress', 'completed', 'cancelled', 'full');
CREATE TYPE booking_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE driver_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected');

-- 2. TABLES

-- Profiles (Syncs with auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    phone_number TEXT,
    role user_role DEFAULT 'passenger',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drivers (Verification and Documents)
CREATE TABLE public.drivers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    email TEXT,
    dob DATE,
    profession TEXT,
    address TEXT,
    city TEXT,
    pincode TEXT,
    vehicle_number TEXT,
    vehicle_type TEXT, -- 'car', 'bike'
    dl_number TEXT,
    aadhaar_pan_number TEXT,
    aadhaar_pan_type TEXT,
    profile_photo_url TEXT,
    vehicle_front_url TEXT,
    vehicle_back_url TEXT,
    vehicle_left_url TEXT,
    vehicle_right_url TEXT,
    dl_front_url TEXT,
    dl_back_url TEXT,
    rc_front_url TEXT,
    rc_back_url TEXT,
    aadhaar_pan_front_url TEXT,
    aadhaar_pan_back_url TEXT,
    insurance_url TEXT,
    status driver_status DEFAULT 'pending',
    wallet_balance DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trips (Ride Offers)
CREATE TABLE public.trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    from_location TEXT NOT NULL,
    to_location TEXT NOT NULL,
    travel_date DATE NOT NULL,
    travel_time TIME NOT NULL,
    available_seats INTEGER NOT NULL,
    price_per_seat DECIMAL(10, 2),
    vehicle_type TEXT DEFAULT 'car',
    status trip_status DEFAULT 'active',
    recurring_days TEXT, -- e.g., 'Mon,Tue,Wed'
    preferences JSONB DEFAULT '{}', -- Flexible preferences
    ladies_only BOOLEAN DEFAULT FALSE,
    no_smoking BOOLEAN DEFAULT FALSE,
    pet_friendly BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Booking Requests (Ride Requests)
CREATE TABLE public.booking_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    passenger_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    seats_requested INTEGER DEFAULT 1,
    status booking_status DEFAULT 'pending',
    payment_mode TEXT DEFAULT 'cod', -- 'cod', 'online'
    message TEXT,
    otp_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews & Ratings
CREATE TABLE public.reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT, -- 'booking_pending', 'booking_approved', etc.
    title TEXT,
    message TEXT,
    reference_id UUID, -- Trip ID or Booking ID
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Withdrawal Requests
CREATE TABLE public.withdrawal_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    method TEXT, -- 'upi', 'bank'
    details JSONB, -- {upiId: '...'} or {accountNumber: '...', ifsc: '...', holderName: '...'}
    status withdrawal_status DEFAULT 'pending',
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FUNCTIONS & TRIGGERS

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Profile Creation Trigger on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone_number, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        NEW.email,
        NEW.raw_user_meta_data->>'phone_number',
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'passenger')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for all tables with updated_at
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_drivers_modtime BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trips_modtime BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_modtime BEFORE UPDATE ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_withdrawals_modtime BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RPC: Approve Withdrawal Request (Handles Wallet Deduction)
CREATE OR REPLACE FUNCTION public.approve_withdrawal_request(request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_driver_id UUID;
    v_amount DECIMAL;
BEGIN
    -- Get request details
    SELECT driver_id, amount INTO v_driver_id, v_amount 
    FROM public.withdrawal_requests 
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or already processed';
    END IF;

    -- Update Request Status
    UPDATE public.withdrawal_requests 
    SET status = 'approved', updated_at = NOW()
    WHERE id = request_id;

    -- Deduct from Driver Wallet
    UPDATE public.drivers
    SET wallet_balance = wallet_balance - v_amount
    WHERE id = v_driver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS POLICIES

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can see/edit own, Admin sees all
CREATE POLICY "Profiles are viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles are viewable by admin" ON public.profiles FOR SELECT USING (is_admin());
CREATE POLICY "Profiles are updatable by owner" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Drivers: Users can see/edit own, Admin sees all
CREATE POLICY "Drivers see own record" ON public.drivers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Drivers updatable by owner" ON public.drivers FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins manage all drivers" ON public.drivers ALL USING (is_admin());
CREATE POLICY "Passengers see approved drivers" ON public.drivers FOR SELECT USING (status = 'approved');

-- Trips: Publicly viewable if active, updatable by owner
CREATE POLICY "Public trips are viewable" ON public.trips FOR SELECT USING (status = 'active');
CREATE POLICY "Owners manage their trips" ON public.trips ALL USING (user_id = auth.uid());
CREATE POLICY "Admins view all trips" ON public.trips FOR SELECT USING (is_admin());

-- Bookings: Viewable by passenger and driver. Creatable by passenger.
CREATE POLICY "Passengers view own bookings" ON public.booking_requests FOR SELECT USING (passenger_id = auth.uid());
CREATE POLICY "Drivers view trip bookings" ON public.booking_requests FOR SELECT USING (
    trip_id IN (SELECT id FROM public.trips WHERE user_id = auth.uid())
);
CREATE POLICY "Passengers create bookings" ON public.booking_requests FOR INSERT WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "Drivers update booking status" ON public.booking_requests FOR UPDATE USING (
    trip_id IN (SELECT id FROM public.trips WHERE user_id = auth.uid())
);

-- Notifications: Recipient only
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());

-- Reviews: Viewable by target and reviewer
CREATE POLICY "Reviews are public" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users create reviews" ON public.reviews FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- Withdrawals: Driver creates/views, Admin manages
CREATE POLICY "Drivers manage own withdrawals" ON public.withdrawal_requests ALL USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
);
CREATE POLICY "Admins manage all withdrawals" ON public.withdrawal_requests ALL USING (is_admin());
-- 5. REALTIME ENABLING
-- Enable Realtime for relevant tables
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
