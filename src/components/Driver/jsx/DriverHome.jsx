import React, { useState, useEffect } from 'react';
import { Plus, Car, Bike, MapPin, Calendar, Clock, ChevronRight, User, LogOut, Wallet } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import toast from 'react-hot-toast';
import '../css/DriverHome.css';

const DriverHome = ({ onPublishTrip, onMyTrips, onBookingRequests, onProfile, onLogout, onWallet }) => {
    const [driverName, setDriverName] = useState('Driver');
    const [stats, setStats] = useState({
        activeTrips: 0,
        pendingRequests: 0,
        completedTrips: 0
    });
    const [recentTrips, setRecentTrips] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDriverData();

        // Subscribe to trips and booking_requests for real-time updates
        const tripsChannel = supabase
            .channel('driver_home_trips')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'trips',
            }, (payload) => {
                console.log('Driver home - trip update:', payload);
                fetchDriverData(); // Refresh dashboard data
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Driver home subscribed to trips updates');
                }
            });

        const requestsChannel = supabase
            .channel('driver_home_requests')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'booking_requests',
            }, (payload) => {
                console.log('Driver home - booking request update:', payload);
                fetchDriverData(); // Refresh dashboard data
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Driver home subscribed to booking requests updates');
                }
            });

        return () => {
            console.log('Cleaning up driver home subscriptions');
            supabase.removeChannel(tripsChannel);
            supabase.removeChannel(requestsChannel);
        };
    }, []);

    const fetchDriverData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch driver name from profiles
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .maybeSingle();

            if (profile?.full_name) {
                setDriverName(profile.full_name);
            }

            // Fetch trips stats
            const { data: trips, error } = await supabase
                .from('trips')
                .select('*')
                .eq('user_id', user.id);

            if (!error && trips) {
                const activeTrips = trips.filter(t => t.status === 'active' || t.status === 'full');
                const completedTrips = trips.filter(t => t.status === 'completed');

                setStats({
                    activeTrips: activeTrips.length,
                    pendingRequests: 0, // Will be updated when we fetch booking requests
                    completedTrips: completedTrips.length
                });

                // Get recent trips
                setRecentTrips(trips.slice(0, 3));
            }

            // Fetch pending booking requests
            const { data: requests } = await supabase
                .from('booking_requests')
                .select(`
                    id,
                    trip_id,
                    trips!inner (user_id)
                `)
                .eq('trips.user_id', user.id)
                .eq('status', 'pending');

            if (requests) {
                setStats(prev => ({ ...prev, pendingRequests: requests.length }));
            }

        } catch (error) {
            console.error('Error fetching driver data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-IN', {
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

    return (
        <div className="driver-home-container animate-page-in">
            {/* Header */}
            <div className="driver-header">
                <div className="header-content">
                    <div className="welcome-section">
                        <span className="welcome-label">Welcome back,</span>
                        <h1 className="driver-name">{driverName}!</h1>
                    </div>
                    <div className="header-actions">
                        <button className="icon-btn" onClick={onProfile}>
                            <User size={22} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="driver-content">
                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card active">
                        <div className="stat-icon">
                            <Car size={24} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.activeTrips}</span>
                            <span className="stat-label">Active Trips</span>
                        </div>
                    </div>
                    <div className="stat-card pending" onClick={onBookingRequests}>
                        <div className="stat-icon">
                            <Clock size={24} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.pendingRequests}</span>
                            <span className="stat-label">Pending Requests</span>
                        </div>
                        {stats.pendingRequests > 0 && (
                            <div className="notification-badge">{stats.pendingRequests}</div>
                        )}
                    </div>
                </div>

                {/* Publish Trip Button */}
                <button className="publish-trip-btn" onClick={onPublishTrip}>
                    <div className="btn-icon">
                        <Plus size={28} />
                    </div>
                    <div className="btn-text">
                        <span className="btn-title">Publish a Trip</span>
                        <span className="btn-subtitle">Share your ride with passengers</span>
                    </div>
                    <ChevronRight size={24} className="btn-arrow" />
                </button>

                {/* Quick Actions */}
                <div className="quick-actions">
                    <h2 className="section-title">Quick Actions</h2>
                    <div className="actions-grid">
                        <button className="action-card" onClick={onMyTrips}>
                            <Calendar size={28} />
                            <span>My Trips</span>
                        </button>
                        <button className="action-card" onClick={onBookingRequests}>
                            <User size={28} />
                            <span>Requests</span>
                        </button>
                        <button className="action-card" onClick={onWallet}>
                            <Wallet size={28} />
                            <span>Wallet</span>
                        </button>
                    </div>
                </div>

                {/* Recent Trips */}
                {recentTrips.length > 0 && (
                    <div className="recent-trips">
                        <div className="section-header">
                            <h2 className="section-title">Recent Trips</h2>
                            <button className="view-all-btn" onClick={onMyTrips}>
                                View All
                            </button>
                        </div>
                        <div className="trips-list">
                            {recentTrips.map(trip => (
                                <div key={trip.id} className="trip-card">
                                    <div className="trip-icon">
                                        {trip.vehicle_type === 'car' ? <Car size={20} /> : <Bike size={20} />}
                                    </div>
                                    <div className="trip-info">
                                        <div className="trip-route">
                                            <span className="from">{trip.from_location}</span>
                                            <span className="arrow">→</span>
                                            <span className="to">{trip.to_location}</span>
                                        </div>
                                        <div className="trip-meta">
                                            <span>{formatDate(trip.travel_date)}</span>
                                            <span className="dot">•</span>
                                            <span>{formatTime(trip.travel_time)}</span>
                                            <span className="dot">•</span>
                                            <span>{trip.available_seats} seats</span>
                                        </div>
                                    </div>
                                    <div className={`trip-status ${trip.status}`}>
                                        {trip.status}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Logout Button */}
                <button className="logout-btn" onClick={onLogout}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default DriverHome;

