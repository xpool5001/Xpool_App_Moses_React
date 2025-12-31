import React, { useState, useEffect } from 'react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MapPin, Navigation, ArrowLeft, Search, Menu, User, BookOpen, Clock as HistoryIcon, CreditCard, ChevronRight, Calendar, Car, Bike } from 'lucide-react';
import toast from 'react-hot-toast';
import '../css/PassengerHome.css';
import LocationInput from '../../common/LocationInput';

// Component to handle map centering and routing updates
const MapUpdater = ({ center, destination, onRouteInfo }) => {
    const map = useMap();
    const [directionsRenderer, setDirectionsRenderer] = useState(null);

    useEffect(() => {
        if (!map) return;

        if (center) {
            map.panTo(center);
        }
    }, [map, center]);

    useEffect(() => {
        if (!map) return;

        // Initialize DirectionsRenderer if not exists
        if (!directionsRenderer) {
            const dr = new window.google.maps.DirectionsRenderer({
                map,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: 'black',
                    strokeWeight: 5,
                    strokeOpacity: 0.7
                }
            });
            setDirectionsRenderer(dr);
        }
    }, [map, directionsRenderer]);

    useEffect(() => {
        if (!directionsRenderer || !center || !destination) {
            if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
            return;
        }

        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route(
            {
                origin: center,
                destination: destination,
                travelMode: window.google.maps.TravelMode.DRIVING
            },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) {
                    directionsRenderer.setDirections(result);
                    if (onRouteInfo) {
                        const route = result.routes[0].legs[0];
                        onRouteInfo({
                            distance: route.distance.text,
                            duration: route.duration.text
                        });
                    }
                } else {
                    console.error(`Directions request failed: ${status}`);
                    if (onRouteInfo) onRouteInfo(null);
                }
            }
        );
    }, [center, destination, directionsRenderer, onRouteInfo]);

    return null;
};

const PassengerHome = ({ onBack, onSearchTrips, onNavigate }) => {
    const [pickup, setPickup] = useState('');
    const [dropoff, setDropoff] = useState('');
    const [currentLocation, setCurrentLocation] = useState(null); // { lat, lng }
    const [pickupCoords, setPickupCoords] = useState(null);
    const [destinationCoords, setDestinationCoords] = useState(null); // { lat, lng }
    const [routeInfo, setRouteInfo] = useState(null); // { distance, duration }
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [travelDate, setTravelDate] = useState(new Date().toISOString().split('T')[0]);
    const [vehiclePreference, setVehiclePreference] = useState('any');

    useEffect(() => {
        if (!navigator.geolocation) {
            toast.error("Geolocation is not supported");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ lat: latitude, lng: longitude });
                setPickup("Current Location");
            },
            () => {
                toast.error("Please enable location access");
                setCurrentLocation({ lat: 19.0760, lng: 72.8777 }); // Default: Mumbai
            }
        );
    }, []);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    const handleMenuClick = (screen) => {
        setIsMenuOpen(false);
        if (onNavigate) {
            onNavigate(screen);
        }
    };

    const getCoordinates = async (placeId, callback) => {
        // Try PlacesService first if available
        if (window.google && window.google.maps && window.google.maps.places) {
            try {
                const service = new window.google.maps.places.PlacesService(document.createElement('div'));
                service.getDetails({ placeId }, (place, status) => {
                    if (status === 'OK' && place.geometry && place.geometry.location) {
                        callback({
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng()
                        });
                        return;
                    }
                    // If failed, fall through to Geocoding API
                    console.warn(`PlacesService failed with status: ${status}. Trying Geocoding API.`);
                    fetchCoordsFromGeocoding(placeId, callback);
                });
            } catch (error) {
                console.error('PlacesService crashed:', error);
                fetchCoordsFromGeocoding(placeId, callback);
            }
        } else {
            // Fallback directly if google maps not loaded
            console.warn('Google Maps JS API not loaded/available. Using Geocoding API.');
            fetchCoordsFromGeocoding(placeId, callback);
        }
    };

    const fetchCoordsFromGeocoding = async (placeId, callback) => {
        try {
            // Check if placeId looks like a text address (from geocoding fallback) or a real place_id
            // Our LocationInput fallback uses place_id = result.place_id
            const isPlaceId = !placeId.includes(' '); // Crude check, but place_ids don't have spaces typically

            // If it's a geocode_ index from our fallback, we need to use the address string?
            // Wait, handlePlaceSelect passes 'prediction' object.
            // In fallback, we set place_id: result.place_id.

            let url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;

            // Handle edge case where placeId might be invalid or we need to search by address string
            // But getCoordinates only takes placeId.
            // Ideally we should pass the whole prediction object to getCoordinates?

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK' && data.results && data.results[0]?.geometry?.location) {
                callback(data.results[0].geometry.location);
            } else {
                console.error('Geocoding API for Coords failed:', data.status);
                toast.error('Could not get location details');
            }
        } catch (error) {
            console.error('Geocoding API network error:', error);
        }
    };

    const handlePlaceSelect = (type, prediction) => {
        // If prediction comes from our own fallback with a dummy ID, we might need address?
        // But our fallback uses real place_id from geocoding API results.
        getCoordinates(prediction.place_id, (coords) => {
            if (type === 'pickup') {
                setPickupCoords(coords);
            } else {
                setDestinationCoords(coords);
                // Also trigger route calculation? Handled by useEffect dependence on coords
            }
        });
    };

    const handleDropoffChange = (e) => {
        const val = e.target.value;
        setDropoff(val);
        if (!val) {
            setDestinationCoords(null);
            setRouteInfo(null);
        }
    };

    const defaultCenter = { lat: 19.0760, lng: 72.8777 };

    return (
        <div className="passenger-home-container">
            {/* Sidebar Menu */}
            <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
                <div className="menu-header">
                    <User size={40} className="user-icon" />
                    <div className="user-info">
                        <h3>Hi there!</h3>
                        <p>Passenger</p>
                    </div>
                </div>
                <div className="menu-items">
                    <button onClick={() => handleMenuClick('passengerProfile')}>
                        <User size={20} />
                        <span>My Profile</span>
                        <ChevronRight size={16} />
                    </button>
                    <button onClick={() => handleMenuClick('myBookings')}>
                        <BookOpen size={20} />
                        <span>My Bookings</span>
                        <ChevronRight size={16} />
                    </button>
                    <button onClick={() => handleMenuClick('rideHistory')}>
                        <HistoryIcon size={20} />
                        <span>Ride History</span>
                        <ChevronRight size={16} />
                    </button>
                    <button onClick={() => handleMenuClick('paymentDetails')}>
                        <CreditCard size={20} />
                        <span>Payment Details</span>
                        <ChevronRight size={16} />
                    </button>
                </div>
                <div className="menu-footer">
                    <button className="logout-btn" onClick={() => handleMenuClick('logout')}>Logout</button>
                </div>
            </div>

            {/* Overlay */}
            {isMenuOpen && <div className="menu-overlay" onClick={toggleMenu}></div>}

            {/* Header */}
            <div className="yellow-header">
                <div className="header-content">
                    <button className="menu-btn" onClick={toggleMenu}>
                        <Menu size={24} />
                    </button>
                    <div className="header-text">
                        <h1>Xpool</h1>
                        <h2>Find your ride</h2>
                    </div>
                </div>
            </div>

            <div className="floating-card">
                <LocationInput
                    name="pickup"
                    placeholder="Current Location"
                    value={pickup}
                    onChange={(e) => {
                        setPickup(e.target.value);
                        if (!e.target.value) setPickupCoords(null);
                    }}
                    onPlaceSelect={(p) => handlePlaceSelect('pickup', p)}
                    Icon={Navigation}
                    iconColor="gray"
                    className="input-group"
                />

                <div className="connector-line"></div>

                <LocationInput
                    name="dropoff"
                    placeholder="Search Destination"
                    value={dropoff}
                    onChange={handleDropoffChange}
                    onPlaceSelect={(p) => handlePlaceSelect('dropoff', p)}
                    Icon={MapPin}
                    iconColor="yellow"
                    className="input-group input-group-last"
                />

                <div className="filter-row-home">
                    <div className="filter-item">
                        <div className="icon-box-small">
                            <Calendar size={16} />
                        </div>
                        <input
                            type="date"
                            className="date-input-home"
                            value={travelDate}
                            onChange={(e) => setTravelDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                        />
                    </div>
                    <div className="vehicle-selector-home">
                        {['any', 'car', 'bike'].map(type => (
                            <button
                                key={type}
                                className={`vehicle-tab ${vehiclePreference === type ? 'active' : ''}`}
                                onClick={() => setVehiclePreference(type)}
                                title={type.charAt(0).toUpperCase() + type.slice(1)}
                            >
                                {type === 'any' && <span className="text-any">Any</span>}
                                {type === 'car' && <Car size={16} />}
                                {type === 'bike' && <Bike size={16} />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="map-layer">
                {routeInfo && (
                    <div className="route-info-overlay">
                        <div className="info-item">
                            <span className="label">Distance:</span>
                            <span className="value">{routeInfo.distance}</span>
                        </div>
                        <div className="info-divider"></div>
                        <div className="info-item">
                            <span className="label">Time:</span>
                            <span className="value">{routeInfo.duration}</span>
                        </div>
                    </div>
                )}
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={15}
                    mapId="XPOOL_MAP_ID"
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    className="map-container"
                    style={{ width: '100%', height: '100%' }}
                >
                    {(pickupCoords || currentLocation) && (
                        <>
                            <AdvancedMarker position={pickupCoords || currentLocation} />
                            <MapUpdater
                                center={pickupCoords || currentLocation}
                                destination={destinationCoords}
                                onRouteInfo={setRouteInfo}
                            />
                        </>
                    )}
                    {destinationCoords && (
                        <AdvancedMarker position={destinationCoords} />
                    )}
                </Map>
            </div>

            <div className="continue-btn-container">
                <button
                    className="search-trips-btn"
                    onClick={() => onSearchTrips({
                        from: pickup,
                        to: dropoff,
                        date: travelDate,
                        vehicle: vehiclePreference
                    })}
                >
                    <Search size={20} />
                    Find Pre-booked Trips
                </button>
            </div>
        </div>
    );
};

export default PassengerHome;
