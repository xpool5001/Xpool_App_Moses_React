import React, { useState, useEffect } from 'react';
import { ArrowLeft, Car, Bike, MapPin, Calendar, Clock, Users, X, Filter, Key } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import toast from 'react-hot-toast';
import { isTripToday, canStartJourney, formatDate, formatTime } from '../../../utils/dateHelper';
import { generateAndSaveOTP } from '../../../utils/otpHelper';
import '../css/MyTrips.css';

const MyTrips = ({ onBack, onRideStart }) => {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [bookingCounts, setBookingCounts] = useState({});

    useEffect(() => {
        fetchTrips();

        // Get current user for subscription filter
        const setupSubscriptions = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Subscribe to trips table changes
            const tripsChannel = supabase
                .channel('my_trips_updates')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'trips',
                    filter: `user_id=eq.${user.id}`,
                }, (payload) => {
                    console.log('Trip update received:', payload);
                    fetchTrips(); // Refresh trips when any trip changes
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to trips updates');
                    }
                });

            // Subscribe to booking_requests to update passenger counts
            const bookingsChannel = supabase
                .channel('my_trips_bookings')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'booking_requests',
                }, (payload) => {
                    console.log('Booking update received:', payload);
                    fetchTrips(); // Refresh to update booking counts
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to booking updates');
                    }
                });

            return { tripsChannel, bookingsChannel };
        };

        const subscriptionsPromise = setupSubscriptions();

        return () => {
            subscriptionsPromise.then(channels => {
                if (channels) {
                    console.log('Cleaning up MyTrips subscriptions');
                    supabase.removeChannel(channels.tripsChannel);
                    supabase.removeChannel(channels.bookingsChannel);
                }
            });
        };
    }, []);

    const fetchTrips = async () => {
        try {
            setLoading(true);
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (authError) throw authError;

            if (user) {
                console.log('Fetching trips for user:', user.id);
                const { data, error } = await supabase
                    .from('trips')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('travel_date', { ascending: false });

                if (error) throw error;
                console.log('Trips fetched:', data?.length || 0);

                if (data && data.length > 0) {
                    // Fetch booking counts for all trips efficiently in one go
                    const tripIds = data.map(t => t.id);
                    const { data: countsData, error: countsError } = await supabase
                        .from('booking_requests')
                        .select('trip_id')
                        .in('trip_id', tripIds)
                        .eq('status', 'approved');

                    if (countsError) {
                        console.error('Error fetching booking counts:', countsError);
                    }

                    const counts = {};
                    tripIds.forEach(id => counts[id] = 0);

                    if (countsData) {
                        countsData.forEach(row => {
                            counts[row.trip_id] = (counts[row.trip_id] || 0) + 1;
                        });
                    }

                    setBookingCounts(counts);
                } else {
                    setBookingCounts({});
                }
                setTrips(data || []);
            } else {
                console.warn('No active session found');
                toast.error('Session expired. Please login again.');
            }
        } catch (error) {
            console.error('Error fetching trips:', error);
            toast.error(error.message || 'Failed to load trips');
        } finally {
            setLoading(false);
        }
    };

    const updateTripStatus = async (tripId, newStatus) => {
        try {
            // If starting journey, check if it's allowed
            if (newStatus === 'in_progress') {
                const trip = trips.find(t => t.id === tripId);
                if (trip && !canStartJourney(trip.travel_date, trip.travel_time)) {
                    toast.error('Journey can only be started 30 minutes before scheduled time');
                    return;
                }

                // Generate OTP
                const otp = await generateAndSaveOTP(tripId);
                toast.success(`Journey Started! OTP: ${otp}`);
            }

            const { error } = await supabase
                .from('trips')
                .update({ status: newStatus })
                .eq('id', tripId);

            if (error) throw error;

            setTrips(prev => prev.map(t =>
                t.id === tripId ? { ...t, status: newStatus } : t
            ));

            if (newStatus === 'completed') {
                toast.success('Journey Completed! Wallet updated.');
            }

            if (newStatus === 'in_progress' && onRideStart) {
                const trip = trips.find(t => t.id === tripId);
                if (trip) onRideStart({ ...trip, status: 'in_progress' });
            }
        } catch (error) {
            console.error(`Error updating trip to ${newStatus}:`, error);
            toast.error('Failed to update trip status');
        }
    };

    const handleCancelTrip = async () => {
        if (!selectedTrip) return;

        try {
            const { error } = await supabase
                .from('trips')
                .update({ status: 'cancelled' })
                .eq('id', selectedTrip.id);

            if (error) throw error;

            setTrips(prev => prev.map(t =>
                t.id === selectedTrip.id ? { ...t, status: 'cancelled' } : t
            ));

            toast.success('Trip cancelled successfully');
            setShowCancelModal(false);
            setSelectedTrip(null);
        } catch (error) {
            console.error('Error cancelling trip:', error);
            toast.error('Failed to cancel trip');
        }
    };


    const filteredTrips = trips.filter(trip => {
        if (filter === 'all') return true;
        return trip.status === filter;
    });

    return (
        <div className="my-trips-container animate-page-in">
            {/* Header */}
            <div className="my-trips-header">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={24} />
                </button>
                <h1>My Trips</h1>
            </div>

            {/* Filter Tabs */}
            <div className="trip-filters">
                <button
                    className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All
                </button>
                <button
                    className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
                    onClick={() => setFilter('active')}
                >
                    Active
                </button>
                <button
                    className={`filter-tab ${filter === 'completed' ? 'active' : ''}`}
                    onClick={() => setFilter('completed')}
                >
                    Completed
                </button>
                <button
                    className={`filter-tab ${filter === 'cancelled' ? 'active' : ''}`}
                    onClick={() => setFilter('cancelled')}
                >
                    Cancelled
                </button>
            </div>

            {/* Trips List */}
            <div className="trips-content">
                {loading ? (
                    // ...
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading trips...</p>
                    </div>
                ) : filteredTrips.length === 0 ? (
                    // ...
                    <div className="empty-state">
                        <Car size={48} />
                        <h3>No trips found</h3>
                        <p>
                            {filter === 'all'
                                ? "You haven't published any trips yet"
                                : `No ${filter} trips`}
                        </p>
                    </div>
                ) : (
                    <div className="trips-list">
                        {filteredTrips.map(trip => {
                            const passengerCount = bookingCounts[trip.id] || 0;
                            const isTodayTrip = isTripToday(trip.travel_date);
                            const canStart = canStartJourney(trip.travel_date, trip.travel_time);

                            return (
                                <div key={trip.id} className="trip-card">
                                    <div className="trip-card-header">
                                        <div className="left-meta">
                                            <div className="vehicle-badge">
                                                {trip.vehicle_type === 'car' ? <Car size={14} /> : <Bike size={14} />}
                                                <span>{trip.vehicle_type}</span>
                                            </div>
                                            <div className="trip-time-meta">
                                                <Calendar size={14} />
                                                <span>{formatDate(trip.travel_date, 'medium')}</span>
                                                <span className="dot">•</span>
                                                <Clock size={14} />
                                                <span>{formatTime(trip.travel_time)}</span>
                                            </div>
                                        </div>
                                        <div className={`status-badge ${trip.status}`}>
                                            {trip.status.replace('_', ' ')}
                                        </div>
                                    </div>

                                    <div className="trip-card-body">
                                        <div className="vertical-route">
                                            <div className="route-point from">
                                                <div className="point-icon origin"></div>
                                                <span className="location-name">{trip.from_location}</span>
                                            </div>
                                            <div className="route-connector"></div>
                                            <div className="route-point to">
                                                <div className="point-icon destination"></div>
                                                <span className="location-name">{trip.to_location}</span>
                                            </div>
                                        </div>

                                        <div className="trip-incentives">
                                            {trip.status === 'active' && passengerCount === 0 && (
                                                <div className="incentive-badge waiting">
                                                    <Users size={14} />
                                                    <span>Waiting for passengers</span>
                                                </div>
                                            )}
                                            {trip.status === 'active' && passengerCount > 0 && (
                                                <div className="incentive-badge confirmed">
                                                    <Users size={14} />
                                                    <span>{passengerCount} Confirmed</span>
                                                </div>
                                            )}
                                            {isTodayTrip && trip.status === 'active' && (
                                                <div className="incentive-badge today">
                                                    <Key size={14} />
                                                    <span>Trip is Today</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="trip-card-footer">
                                        <div className="footer-info">
                                            <div className="seats-info">
                                                <Users size={16} />
                                                <span>{trip.available_seats} seats avail.</span>
                                            </div>
                                            {trip.price_per_seat && (
                                                <div className="price-tag">
                                                    <span>₹{trip.price_per_seat}</span>
                                                    <small>/seat</small>
                                                </div>
                                            )}
                                        </div>

                                        <div className="action-buttons">
                                            {trip.status === 'active' && (
                                                <>
                                                    <button
                                                        className={`primary-action-btn start ${!canStart ? 'disabled' : ''}`}
                                                        onClick={() => canStart && updateTripStatus(trip.id, 'in_progress')}
                                                        disabled={!canStart}
                                                    >
                                                        {canStart ? 'START TRIP' : 'Starts ' + formatTime(trip.travel_time)}
                                                    </button>
                                                    <button
                                                        className="secondary-action-btn cancel"
                                                        onClick={() => {
                                                            setSelectedTrip(trip);
                                                            setShowCancelModal(true);
                                                        }}
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </>
                                            )}

                                            {trip.status === 'in_progress' && (
                                                <>
                                                    <button
                                                        className="primary-action-btn resume"
                                                        onClick={() => onRideStart && onRideStart(trip)}
                                                    >
                                                        RESUME MAP
                                                    </button>
                                                    <button
                                                        className="secondary-action-btn finish"
                                                        onClick={() => updateTripStatus(trip.id, 'completed')}
                                                    >
                                                        FINISH
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ... (Modal) ... */}
            {showCancelModal && (
                <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setShowCancelModal(false)}>
                            <X size={24} />
                        </button>
                        <div className="modal-icon warning">
                            <X size={32} />
                        </div>
                        <h2>Cancel Trip?</h2>
                        <p>Are you sure you want to cancel this trip? This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowCancelModal(false)}>
                                Keep Trip
                            </button>
                            <button className="btn-danger" onClick={handleCancelTrip}>
                                Cancel Trip
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyTrips;

