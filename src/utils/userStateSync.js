import { supabase } from '../supabaseClient';

/**
 * Updates the user's current screen and role in the database.
 * @param {string} userId - The user's ID.
 * @param {string} screen - The current screen name.
 * @param {string} role - The user's role (optional).
 */
export const syncStateToBackend = async (userId, screen, role) => {
    if (!userId) return;

    try {
        const updates = {
            updated_at: new Date(),
            last_screen: screen,
        };
        if (role) updates.user_role = role;

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) {
            console.error('Error syncing state to backend:', error);
        }
    } catch (error) {
        console.error('Exception syncing state:', error);
    }
};

/**
 * Fetches the user's last saved state from the database.
 * @param {string} userId - The user's ID.
 * @returns {Promise<{screen: string, role: string, driverStatus?: string} | null>}
 */
export const fetchStateFromBackend = async (userId) => {
    if (!userId) return null;

    try {
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('last_screen, user_role')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('Error fetching state from backend:', profileError);
            return null;
        }

        let driverStatus = null;
        if (profileData.user_role === 'driver') {
            const { data: driverData, error: driverError } = await supabase
                .from('drivers')
                .select('status')
                .eq('user_id', userId);

            if (!driverError && driverData && driverData.length > 0) {
                 // Check if ANY record is approved
                 if (driverData.some(d => d.status === 'approved')) {
                     driverStatus = 'approved';
                 } else if (driverData.some(d => d.status === 'pending')) {
                     driverStatus = 'pending';
                 } else {
                     // Default to the status of the most recent one if neither approved nor pending (e.g. all rejected)
                     // or just return 'rejected' if all are rejected.
                     driverStatus = 'rejected';
                 }
            }
        }

        return {
            screen: profileData.last_screen,
            role: profileData.user_role,
            driverStatus: driverStatus
        };
    } catch (error) {
        console.error('Exception fetching state:', error);
        return null;
    }
};
