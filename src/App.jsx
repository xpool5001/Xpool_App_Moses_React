import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { supabase } from './supabaseClient';
import { syncStateToBackend, fetchStateFromBackend } from './utils/userStateSync';

import Splash from './components/common/Splash';
import Onboarding from './components/common/Onboarding';
import RoleSelection from './components/common/RoleSelection';
import AuthSelection from './components/common/AuthSelection';
import Login from './components/common/Login';
import Signup from './components/common/Signup';
import Welcome from './components/common/Welcome';
import PhoneLogin from './components/common/PhoneLogin';

import OTPVerification from './components/common/OTPVerification';

// Notification & Utilities
import { subscribeToNotifications, unsubscribeFromNotifications } from './utils/notificationHelper';
import toast from 'react-hot-toast';
import NetworkStatus from './components/common/NetworkStatus';
import DebugConsole from './components/common/DebugConsole';

import PoolingSelection from './components/Driver/jsx/PoolingSelection';
import DriverDocuments from './components/Driver/jsx/DriverDocuments';
import VerificationInProgress from './components/Driver/jsx/VerificationInProgress';
import DriverWelcome from './components/Driver/jsx/DriverWelcome';
import PassengerHome from './components/Passenger/jsx/PassengerHome';

import Profile from './components/common/Profile';

// New Trip Publishing Components
import DriverHome from './components/Driver/jsx/DriverHome';
import DriverWallet from './components/Driver/jsx/DriverWallet';
import PublishTrip from './components/Driver/jsx/PublishTrip';
import MyTrips from './components/Driver/jsx/MyTrips';
import BookingRequests from './components/Driver/jsx/BookingRequests';
import SearchTrips from './components/Passenger/jsx/SearchTrips';
import TripBooking from './components/Passenger/jsx/TripBooking';
import ActiveRide from './components/Driver/jsx/ActiveRide';

// New Passenger Components
import PassengerProfile from './components/Passenger/jsx/PassengerProfile';
import PaymentDetails from './components/Passenger/jsx/PaymentDetails';
import MyBookings from './components/Passenger/jsx/MyBookings';
import RideHistory from './components/Passenger/jsx/RideHistory';
import PassengerRideDetails from './components/Passenger/jsx/PassengerRideDetails';

import { APIProvider } from '@vis.gl/react-google-maps';

import './App.css';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function App() {
  const [currentScreen, setCurrentScreen] = useState(() => localStorage.getItem('currentScreen') || 'splash');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole') || null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [session, setSession] = useState(null);
  const [passengerSearchParams, setPassengerSearchParams] = useState({
    from: '',
    to: '',
    date: '',
    vehicle: 'any'
  });

  // Initial Session Check & State Restoration
  useEffect(() => {
    const initializeSession = async () => {
      // [Manual Restore] Check for manual token to bypass WebView hangs
      const manualToken = localStorage.getItem('xpool_manual_token');
      if (manualToken) {
        console.log('[App] Found manual token, attempting restore...');
        try {
          // Attempt to parse the JSON bundle (v2.1)
          let tokenBundle;
          try {
            tokenBundle = JSON.parse(manualToken);
          } catch (e) {
            // Fallback for old simple refresh token format (v2.0)
            tokenBundle = { refresh_token: manualToken };
          }

          const { data, error } = await supabase.auth.setSession(tokenBundle);

          if (!error && data?.session) {
            console.log('[App] Manual restore success');
            localStorage.setItem('xpool_manual_token', JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token
            }));
          } else {
            console.warn('[App] Manual restore failed, attempting refresh...', error);
            // Fallback: If setSession fails (e.g. expired access token), try refreshing
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshData?.session) {
              console.log('[App] Session refresh successful');
              localStorage.setItem('xpool_manual_token', JSON.stringify({
                access_token: refreshData.session.access_token,
                refresh_token: refreshData.session.refresh_token
              }));
            } else {
              console.error('[App] Complete session restoration failed');
              localStorage.removeItem('xpool_manual_token');
            }
          }
        } catch (e) {
          console.error('[App] Manual restore error:', e);
        }
      }

      const { data: { session: existingSession } } = await supabase.auth.getSession();
      setSession(existingSession);
      if (existingSession?.user) {
        // Restore state from backend if user is logged in
        const backendState = await fetchStateFromBackend(existingSession.user.id);
        if (backendState) {
          if (backendState.role) setUserRole(backendState.role);

          // Priority Check: Driver Status
          if (backendState.role === 'driver' && backendState.driverStatus === 'approved') {
            setCurrentScreen('driverHome');
            return;
          }

          // Smart redirection: If saved screen is auth-related but user is logged in, redirect to home
          if (['login', 'signup', 'authSelection', 'roleSelection', 'splash', 'onboarding'].includes(backendState.screen)) {
            // Let the default flow or handleLoginSuccess logic take over, or default to Role Home
            // For now, if we have a role, go to that role's home, else stay/selection
            if (backendState.role === 'driver') setCurrentScreen('driverHome'); // This might catch edge cases, but the above status check handles the distinct ones
            else if (backendState.role === 'passenger') setCurrentScreen('passengerHome');
            else setCurrentScreen(backendState.screen);
          } else {
            // For drivers with pending status, this should catch 'verificationInProgress' or 'driverDocuments'
            // If driverStatus is rejected, checking last_screen is also fine, or force Documents
            if (backendState.role === 'driver' && backendState.driverStatus === 'rejected') {
              setCurrentScreen('driverDocuments');
            } else {
              setCurrentScreen(backendState.screen || 'welcome');
            }
          }
        }
      }
    };

    initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      // Manual Token Sync
      if (newSession) {
        localStorage.setItem('xpool_manual_token', JSON.stringify({
          access_token: newSession.access_token,
          refresh_token: newSession.refresh_token
        }));
      } else if (!newSession && _event === 'SIGNED_OUT') {
        localStorage.removeItem('xpool_manual_token');
      }

      setSession(newSession);
      if (_event === 'SIGNED_IN' && newSession?.user) {
        // Refetch implementation in case of fresh login
        const backendState = await fetchStateFromBackend(newSession.user.id);
        if (backendState?.role) setUserRole(backendState.role);
      }
      if (_event === 'SIGNED_OUT') {
        // Clear all storage to remove cache/memory
        localStorage.clear();
        sessionStorage.clear();

        // Force a complete page refresh to start from scratch
        window.location.href = window.location.origin;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Notifications Initialization (Supabase Real-time)
  useEffect(() => {
    if (session?.user) {
      const initNotifications = () => {
        // Subscribe to Real-time Notifications (DB table)
        const sub = subscribeToNotifications(session.user.id, (notif) => {
          toast.success(notif.message, { icon: '🔔', position: 'top-right' });
        });

        return sub;
      };

      const subscription = initNotifications();

      return () => {
        if (subscription) unsubscribeFromNotifications(subscription);
      };
    }
  }, [session]);

  // Sync state to LocalStorage and Backend
  useEffect(() => {
    // LocalStorage
    localStorage.setItem('currentScreen', currentScreen);
    if (userRole) {
      localStorage.setItem('userRole', userRole);
    } else {
      localStorage.removeItem('userRole');
    }

    // Backend Sync
    if (session?.user) {
      // Avoid syncing transient states if desired, but user wants "exact progress"
      syncStateToBackend(session.user.id, currentScreen, userRole);
    }
  }, [currentScreen, userRole, session]);

  const handleSplashFinish = () => {
    setCurrentScreen('onboarding');
  };

  const handleOnboardingFinish = () => {
    setCurrentScreen('roleSelection');
  };

  const handleRoleSelectionFinish = (role) => {
    console.log('Selected role:', role);
    setUserRole(role);
    setCurrentScreen('authSelection');
  };

  /* --- Existing Handler Updates --- */

  const handleAuthLogin = () => {
    setCurrentScreen('login');
  };

  const handleAuthSignup = () => {
    setCurrentScreen('signup');
  };

  const handlePhoneLogin = () => {
    setCurrentScreen('phoneLogin');
  };

  const handlePhoneProceed = (enteredPhone) => {
    setPhoneNumber(enteredPhone);
    setCurrentScreen('otpVerification');
  };

  const handleOTPVerify = (otp) => {
    console.log('Verified OTP:', otp);
    // Mock verification success
    setCurrentScreen('welcome');
  };

  const handleBackToAuth = () => {
    setCurrentScreen('authSelection');
  };

  const handleBackToRole = () => {
    setCurrentScreen('roleSelection');
  };

  const handleLoginSuccess = async () => {
    try {
      console.log('handleLoginSuccess called');

      // We need fresh state here because onAuthStateChange might not have finished updating everything
      // or we want to be explicit about the redirection logic post-login
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      console.log('Current session:', currentSession?.user?.id);

      if (currentSession?.user) {
        let backendState = await fetchStateFromBackend(currentSession.user.id);
        console.log('Backend state:', backendState);

        // If no backend state exists, create a profile for this user
        if (!backendState || !backendState.role) {
          console.log('No profile found, creating one...');

          // Get role from user metadata or use the selected role
          const roleToUse = currentSession.user.user_metadata?.role || userRole || 'passenger';
          const fullName = currentSession.user.user_metadata?.full_name || currentSession.user.email?.split('@')[0] || 'User';

          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: currentSession.user.id,
              full_name: fullName,
              user_role: roleToUse,
              last_screen: 'welcome',


            });

          if (profileError) {
            console.error('Error creating profile:', profileError);
            // If profile creation fails, use fallback navigation
            setUserRole(roleToUse);
            if (roleToUse === 'driver') {
              setCurrentScreen('welcome');
            } else {
              setCurrentScreen('passengerHome');
            }
            return;
          }

          // Fetch the newly created profile
          backendState = await fetchStateFromBackend(currentSession.user.id);
          console.log('Created profile, new backend state:', backendState);
        }

        if (backendState?.role) {
          setUserRole(backendState.role);
          console.log('User role set to:', backendState.role);

          if (backendState.role === 'driver') {
            if (backendState.driverStatus === 'approved') {
              console.log('Navigating to driverHome (approved)');
              setCurrentScreen('driverHome');
            } else if (backendState.driverStatus === 'rejected') {
              console.log('Navigating to driverDocuments (rejected)');
              setCurrentScreen('driverDocuments');
            } else {
              // Pending or unknown - check if we have a valid saved screen
              if (backendState.screen === 'verificationInProgress') {
                console.log('Navigating to verificationInProgress');
                setCurrentScreen('verificationInProgress');
              } else if (backendState.screen && !['login', 'signup', 'authSelection', 'roleSelection', 'splash', 'onboarding'].includes(backendState.screen)) {
                // Use saved screen if it's not an auth-related screen
                console.log('Navigating to saved screen:', backendState.screen);
                setCurrentScreen(backendState.screen);
              } else {
                // Default to welcome for drivers without valid saved progress
                console.log('Navigating to welcome (default for driver)');
                setCurrentScreen('welcome');
              }
            }
          } else {
            // Passenger logic
            if (backendState.screen && !['login', 'signup', 'authSelection'].includes(backendState.screen)) {
              console.log('Navigating to saved screen:', backendState.screen);
              setCurrentScreen(backendState.screen);
            } else {
              console.log('Navigating to passengerHome');
              setCurrentScreen('passengerHome');
            }
          }
        } else {
          // Fallbacks if no backend state - use the role from role selection
          console.log('No backend role found, using userRole:', userRole);
          if (userRole === 'driver') {
            console.log('Navigating to welcome (driver, no backend state)');
            setCurrentScreen('welcome');
          } else if (userRole === 'passenger') {
            console.log('Navigating to passengerHome (passenger, no backend state)');
            setCurrentScreen('passengerHome');
          } else {
            console.log('Navigating to welcome (no role)');
            setCurrentScreen('welcome');
          }
        }
      } else {
        // Should not happen if confirmed logged in
        console.log('No session found, using fallback navigation');
        if (userRole === 'driver') {
          setCurrentScreen('welcome');
        } else if (userRole === 'passenger') {
          setCurrentScreen('passengerHome');
        } else {
          setCurrentScreen('welcome');
        }
      }
    } catch (error) {
      console.error('Error in handleLoginSuccess:', error);
      // Fallback navigation on error
      if (userRole === 'driver') {
        setCurrentScreen('welcome');
      } else if (userRole === 'passenger') {
        setCurrentScreen('passengerHome');
      } else {
        setCurrentScreen('welcome');
      }
    }
  };

  // Modified to handle redirection based on role
  const handleWelcomeGetStarted = () => {
    if (userRole === 'driver') {
      setCurrentScreen('poolingSelection');
    } else {
      setCurrentScreen('passengerHome');
    }
  };

  /* --- New Handlers for Driver Flow --- */

  const handlePoolingConfirm = (option) => {
    console.log('Pooling Option Selected:', option);
    // You might want to save this to state/backend
    setCurrentScreen('driverDocuments');
  };

  const handleDocumentsComplete = () => {
    setCurrentScreen('verificationInProgress');
  };

  const handleVerificationConfirm = () => {
    setCurrentScreen('driverWelcome');
  };

  const handleBackToWelcome = () => {
    console.log('Navigating back to Welcome');
    setCurrentScreen('welcome');
  };

  const handleBackToPooling = () => {
    console.log('Navigating back to Pooling Selection');
    setCurrentScreen('poolingSelection');
  };

  /* --- Render --- */

  return (
    <APIProvider apiKey={API_KEY} libraries={['places', 'geometry']}>
      <div className="app-container">
        <DebugConsole />
        <NetworkStatus />
        <Toaster position="top-center" reverseOrder={false} />
        {currentScreen === 'splash' && <Splash onFinish={handleSplashFinish} />}
        {currentScreen === 'onboarding' && <Onboarding onFinish={handleOnboardingFinish} />}
        {currentScreen === 'roleSelection' && <RoleSelection onFinish={handleRoleSelectionFinish} />}

        {currentScreen === 'authSelection' && (
          <AuthSelection
            onLogin={handleAuthLogin}
            onSignup={handleAuthSignup}
            onPhoneLogin={handlePhoneLogin}
            onBack={handleBackToRole}
          />
        )}

        {currentScreen === 'login' && (
          <Login
            onBack={handleBackToAuth}
            onSignupClick={handleAuthSignup}
            onLoginSuccess={handleLoginSuccess}
            role={userRole}
          />
        )}

        {currentScreen === 'signup' && (
          <Signup
            onBack={handleBackToAuth}
            onLoginClick={handleAuthLogin}
            role={userRole}
          />
        )}

        {currentScreen === 'phoneLogin' && (
          <PhoneLogin
            onBack={handleBackToAuth}
            onProceed={handlePhoneProceed}
          />
        )}

        {currentScreen === 'otpVerification' && (
          <OTPVerification
            phoneNumber={phoneNumber}
            onBack={handlePhoneLogin}
            onVerify={handleOTPVerify}
          />
        )}

        {currentScreen === 'welcome' && (
          <Welcome onGetStarted={handleWelcomeGetStarted} />
        )}

        {/* --- Driver Onboarding Screens --- */}

        {currentScreen === 'poolingSelection' && (
          <PoolingSelection
            onConfirm={handlePoolingConfirm}
            onBack={() => setCurrentScreen('login')}
          />
        )}

        {currentScreen === 'driverDocuments' && (
          <DriverDocuments
            selectedVehicle="Car" // Dynamic in future
            onBack={handleBackToPooling}
            onComplete={handleDocumentsComplete}
          />
        )}

        {currentScreen === 'verificationInProgress' && (
          <VerificationInProgress
            onConfirm={handleVerificationConfirm}
          />
        )}

        {currentScreen === 'driverWelcome' && (
          <DriverWelcome onContinue={() => setCurrentScreen('driverHome')} />
        )}

        {/* --- Driver Dashboard Screens --- */}

        {currentScreen === 'driverHome' && (
          <DriverHome
            onPublishTrip={() => setCurrentScreen('publishTrip')}
            onMyTrips={() => setCurrentScreen('myTrips')}
            onBookingRequests={() => setCurrentScreen('bookingRequests')}
            onProfile={() => setCurrentScreen('profile')}
            onWallet={() => setCurrentScreen('driverWallet')}
            onLogout={() => {
              supabase.auth.signOut();
            }}
          />
        )}

        {currentScreen === 'driverWallet' && (
          <DriverWallet onBack={() => setCurrentScreen('driverHome')} />
        )}

        {currentScreen === 'publishTrip' && (
          <PublishTrip
            onBack={() => setCurrentScreen('driverHome')}
            onSuccess={() => setCurrentScreen('myTrips')}
          />
        )}

        {currentScreen === 'myTrips' && (
          <MyTrips
            onBack={() => setCurrentScreen('driverHome')}
            onRideStart={(trip) => {
              setSelectedTrip(trip);
              setCurrentScreen('activeRide');
            }}
          />
        )}

        {currentScreen === 'bookingRequests' && (
          <BookingRequests onBack={() => setCurrentScreen('driverHome')} />
        )}

        {currentScreen === 'activeRide' && selectedTrip && (
          <ActiveRide
            tripId={selectedTrip.id}
            onBack={() => setCurrentScreen('driverHome')}
            onComplete={() => {
              setSelectedTrip(null);
              setCurrentScreen('driverHome');
            }}
          />
        )}

        {currentScreen === 'passengerHome' && (
          <PassengerHome
            onBack={() => setCurrentScreen('welcome')}
            searchParams={passengerSearchParams}
            setSearchParams={setPassengerSearchParams}
            onSearchTrips={(params) => {
              setPassengerSearchParams(params);
              setCurrentScreen('searchTrips');
            }}
            onNavigate={(screen) => {
              if (screen === 'logout') {
                supabase.auth.signOut();
              } else {
                setCurrentScreen(screen);
              }
            }}
          />
        )}

        {/* --- Passenger Trip Search Screens --- */}

        {currentScreen === 'searchTrips' && (
          <SearchTrips
            onBack={() => setCurrentScreen('passengerHome')}
            searchParams={passengerSearchParams}
            onTripSelect={(trip) => {
              setSelectedTrip(trip);
              setCurrentScreen('tripBooking');
            }}
          />
        )}

        {currentScreen === 'tripBooking' && selectedTrip && (
          <TripBooking
            trip={selectedTrip}
            onBack={() => setCurrentScreen('searchTrips')}
            onSuccess={() => {
              setSelectedTrip(null);
              setCurrentScreen('myBookings');
            }}
          />
        )}

        {/* --- New Passenger Pages --- */}

        {currentScreen === 'passengerProfile' && (
          <PassengerProfile
            onBack={() => setCurrentScreen('passengerHome')}
            onLogout={() => {
              supabase.auth.signOut();
            }}
          />
        )}

        {currentScreen === 'paymentDetails' && (
          <PaymentDetails
            onBack={() => setCurrentScreen('passengerHome')}
          />
        )}

        {currentScreen === 'myBookings' && (
          <MyBookings
            onBack={() => setCurrentScreen('passengerHome')}
            onViewDetails={(booking) => {
              setSelectedTrip(booking);
              setCurrentScreen('passengerRideDetails');
            }}
          />
        )}

        {currentScreen === 'rideHistory' && (
          <RideHistory
            onBack={() => setCurrentScreen('passengerHome')}
            onViewDetails={(ride) => {
              setSelectedTrip(ride);
              setCurrentScreen('passengerRideDetails');
            }}
          />
        )}

        {currentScreen === 'passengerRideDetails' && selectedTrip && (
          <PassengerRideDetails
            booking={selectedTrip}
            onBack={() => setCurrentScreen(selectedTrip.status === 'completed' ? 'rideHistory' : 'myBookings')}
          />
        )}

        {currentScreen === 'profile' && (
          <Profile
            onBack={() => setCurrentScreen(userRole === 'driver' ? 'driverHome' : 'passengerHome')}
            onLogout={() => {
              supabase.auth.signOut();
            }}
          />
        )}

      </div>
    </APIProvider>
  );
}

export default App;
