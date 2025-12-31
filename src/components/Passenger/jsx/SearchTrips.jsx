import React, { useState } from 'react';
import { ArrowLeft, Calendar, Car, Bike, Search, WifiOff } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import toast from 'react-hot-toast';
import { APIProvider } from '@vis.gl/react-google-maps';
import LocationInput from '../../common/LocationInput';
import { isOnline, waitForNetwork, isWebView, getSafeSession } from '../../../utils/webViewHelper';
import '../css/SearchTrips.css';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const SearchTrips = ({ onBack, onTripSelect, searchParams }) => {
    const [searchData, setSearchData] = useState({
        fromLocation: searchParams?.from || '',
        toLocation: searchParams?.to || '',
        travelDate: searchParams?.date || '',
        vehiclePreference: searchParams?.vehicle || 'any'
    });

    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSearchData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Auto-search on mount if params are provided
    React.useEffect(() => {
        if (searchParams) {
            console.log('SearchTrips mounted with params:', searchParams);
            handleSearch();
        }
    }, []);

    const handleSearch = async (e) => {
        if (e) e.preventDefault();

        if (!searchData.fromLocation.trim() || !searchData.toLocation.trim()) {
            toast.error('Please enter both From and To locations');
            return;
        }

        // Check network connectivity first
        if (!isOnline()) {
            toast.error('No internet connection. Please check your network and try again.');
            console.error('Search failed: Device is offline');
            return;
        }

        console.log('=== SEARCH TRIP DEBUG INFO ===');
        console.log('Running in WebView:', isWebView());
        console.log('Network Status:', isOnline() ? 'Online' : 'Offline');
        console.log('Search Parameters:', searchData);
        console.log('==============================');

        setLoading(true);
        setHasSearched(true);

        try {
            // Direct Storage Test
            try {
                const testKey = 'xpool-storage-test-direct';
                window.localStorage.setItem(testKey, 'success');
                const testVal = window.localStorage.getItem(testKey);
                console.log(`[SearchTrips] Direct Storage Test: ${testVal}`);
                window.localStorage.removeItem(testKey);
            } catch (storageErr) {
                console.error('[SearchTrips] Direct Storage Test Failed:', storageErr);
            }

            // Validate session before making query
            console.log('Validating session...');
            const { data: sessionData, error: sessionError } = await getSafeSession(supabase, 5000);

            if (sessionError) {
                console.error('Session validation error:', sessionError);
                if (sessionError.message.includes('timed out')) {
                    // If session check times out, we assume it's a network/storage hang but let's try to proceed as anon if needed?
                    // But for this app, we need auth.
                    throw new Error('Connection timed out while checking login. Please restart the app.');
                }
                throw new Error('Authentication error. Please log in again.');
            }

            if (!sessionData?.session) {
                console.error('No active session found');
                throw new Error('Session expired. Please log in again.');
            }

            console.log('Session validated successfully');
            console.log('User ID:', sessionData.session.user.id);

            // Wait for network if it was temporarily unavailable
            const networkAvailable = await waitForNetwork(3000);
            if (!networkAvailable) {
                throw new Error('Network connection lost. Please try again.');
            }

            let query = supabase
                .from('trips')
                .select(`
                    *,
                    profiles (
                        full_name
                    )
                `)
                .eq('status', 'active')
                .gt('available_seats', 0);

            // Search by location (case-insensitive partial match)
            if (searchData.fromLocation) {
                const city = searchData.fromLocation.split(',')[0].trim();
                console.log('Filtering from_location with:', city);
                query = query.ilike('from_location', `%${city}%`);
            }
            if (searchData.toLocation) {
                const city = searchData.toLocation.split(',')[0].trim();
                console.log('Filtering to_location with:', city);
                query = query.ilike('to_location', `%${city}%`);
            }

            // Filter by date if provided
            if (searchData.travelDate) {
                console.log('Filtering by date:', searchData.travelDate);
                query = query.eq('travel_date', searchData.travelDate);
            }

            // Filter by vehicle type if not 'any'
            if (searchData.vehiclePreference !== 'any') {
                console.log('Filtering by vehicle type:', searchData.vehiclePreference);
                query = query.eq('vehicle_type', searchData.vehiclePreference);
            }

            console.log('Executing Supabase query...');

            // Increased timeout for mobile networks
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Search timed out. Please check your connection and try again.')), 15000)
            );

            const { data, error } = await Promise.race([
                query.order('travel_date', { ascending: true }),
                timeoutPromise
            ]);

            console.log('Query completed successfully');

            if (error) {
                console.error('Supabase Query Error Details:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });

                // Provide user-friendly error messages
                if (error.message.includes('JWT')) {
                    throw new Error('Session expired. Please log in again.');
                } else if (error.message.includes('network')) {
                    throw new Error('Network error. Please check your connection.');
                } else {
                    throw new Error('Failed to search trips. Please try again.');
                }
            }

            console.log('Search Results Count:', data?.length || 0);
            console.log('Raw Results:', data);

            // Map results to include driver_name from joined profiles
            const tripsWithDriver = (data || []).map(trip => {
                let driverName = 'Driver';
                if (trip.profiles) {
                    driverName = Array.isArray(trip.profiles)
                        ? (trip.profiles[0]?.full_name || 'Driver')
                        : (trip.profiles.full_name || 'Driver');
                }
                return {
                    ...trip,
                    driver_name: driverName
                };
            });

            setResults(tripsWithDriver);

            if (tripsWithDriver.length === 0) {
                console.log('No trips found matching criteria');
                toast('No trips found matching your criteria', { icon: '🔍' });
            } else {
                console.log('Successfully found', tripsWithDriver.length, 'trips');
                toast.success(`Found ${tripsWithDriver.length} trip${tripsWithDriver.length > 1 ? 's' : ''}`);
            }
        } catch (error) {
            console.error('=== SEARCH ERROR ===');
            console.error('Error Type:', error.name);
            console.error('Error Message:', error.message);
            console.error('Error Stack:', error.stack);
            console.error('Full Error Object:', error);
            console.error('===================');

            toast.error(error.message || 'Failed to search trips. Please try again.');

            // Set empty results on error
            setResults([]);
        } finally {
            console.log('Search operation completed - setting loading to false');
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    };

    const formatTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    };

    // Get today's date as minimum
    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="search-trips-container">
            {/* Header */}
            <div className="search-header">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={24} />
                </button>
                <h1>Search Trips</h1>
                <div className="header-spacer" />
            </div>

            {/* Results - No Form here as it's now on Home page */}

            {/* Results */}
            <div className="results-section">
                {hasSearched && (
                    <div className="results-header">
                        <h2>
                            {results.length} {results.length === 1 ? 'Trip' : 'Trips'} Found
                        </h2>
                    </div>
                )}

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Searching for trips...</p>
                    </div>
                ) : hasSearched && results.length === 0 ? (
                    <div className="empty-state">
                        <Search size={48} />
                        <h3>No trips found</h3>
                        <p>Try adjusting your search criteria or check back later</p>
                    </div>
                ) : (
                    <div className="results-list">
                        {results.map(trip => (
                            <div
                                key={trip.id}
                                className="trip-result-card"
                                onClick={() => onTripSelect(trip)}
                            >
                                <div className="trip-card-header">
                                    <div className="driver-info">
                                        <div className="driver-avatar">
                                            {trip.driver_name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3>{trip.driver_name}</h3>
                                            <span className="vehicle-type">
                                                {trip.vehicle_type === 'car' ? <Car size={14} /> : <Bike size={14} />}
                                                {trip.vehicle_type}
                                            </span>
                                        </div>
                                    </div>
                                    {trip.price_per_seat && (
                                        <div className="price">
                                            ₹{trip.price_per_seat}
                                            <span>/seat</span>
                                        </div>
                                    )}
                                </div>

                                <div className="trip-route">
                                    <div className="route-point from">
                                        <div className="dot"></div>
                                        <span>{trip.from_location}</span>
                                    </div>
                                    <div className="route-line"></div>
                                    <div className="route-point to">
                                        <div className="dot"></div>
                                        <span>{trip.to_location}</span>
                                    </div>
                                </div>

                                <div className="trip-meta">
                                    <span className="meta-item">
                                        <Calendar size={14} />
                                        {formatDate(trip.travel_date)}
                                    </span>
                                    <span className="meta-item">
                                        <span className="time-icon">🕐</span>
                                        {formatTime(trip.travel_time)}
                                    </span>
                                    <span className="meta-item seats">
                                        {trip.available_seats} seat{trip.available_seats > 1 ? 's' : ''} left
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchTrips;

