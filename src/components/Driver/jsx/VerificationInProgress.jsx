import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import '../css/VerificationInProgress.css';

const VerificationInProgress = ({ onConfirm }) => {
    const [checking, setChecking] = useState(false);

    const checkStatus = async () => {
        setChecking(true);
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error("User not found. Please login again.");
                return;
            }

            // Fetch driver status - Get ALL records for this user
            const { data: drivers, error } = await supabase
                .from('drivers')
                .select('status, id, user_id')
                .eq('user_id', user.id);

            console.log("DEBUG: Driver Fetch Result:", { drivers, error, userId: user.id });

            if (error) throw error;

            if (!drivers || drivers.length === 0) {
                console.error("DEBUG: No driver record found for user", user.id);
                toast.error("No application found.");
                return;
            }

            // Check if ANY record is approved
            const isApproved = drivers.some(d => d.status === 'approved');
            const isRejected = drivers.every(d => d.status === 'rejected'); // Only rejected if ALL are rejected and none are pending/approved

            if (isApproved) {
                toast.success("Profile Approved!");
                onConfirm(); // Proceed to next screen
            } else if (isRejected) {
                toast.error("Application Rejected. Please contact support.");
            } else {
                // If not approved and not fully rejected, it's pending (or mixed pending/rejected)
                toast("Application is still under review.", {
                    icon: '⏳',
                });
            }
        } catch (err) {
            console.error("Status check error", err);
            toast.error("Failed to check status. Try again.");
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="verification-modal-container animate-page-in">
            <div className="verification-modal">
                <div className="flex justify-center mb-4">
                    <Clock className="w-16 h-16 text-yellow-500 animate-pulse" />
                </div>
                <h2 className="modal-title">Verification in Progress</h2>
                <p className="modal-text">
                    Our team is reviewing your details.
                    <br />
                    Verification might take up to 24hrs.
                </p>

                <p className="modal-text highlight">
                    You'll be notified once your profile is approved.
                </p>

                <button
                    className="modal-btn flex items-center justify-center gap-2"
                    onClick={checkStatus}
                    disabled={checking}
                >
                    {checking ? <Loader2 className="animate-spin w-5 h-5" /> : 'Check Status'}
                </button>
            </div>
        </div>
    );
};

export default VerificationInProgress;

