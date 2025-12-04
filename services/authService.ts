import { User } from '../types';

// TODO: Replace this with your actual Google Cloud Client ID
// You can get one at https://console.cloud.google.com/apis/credentials
export const GOOGLE_CLIENT_ID = "324710071500-p770dnh0uvbdlm0lh7jaghrguc8nopud.apps.googleusercontent.com";

/**
 * Decodes a JWT token to extract user information.
 * @param token The JWT token string (Credential)
 */
export const parseJwt = (token: string): any => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to parse JWT", e);
        return null;
    }
};

export const logout = async (): Promise<void> => {
    // Revoke Google token if needed, usually we just clear local state
    if ((window as any).google) {
        (window as any).google.accounts.id.disableAutoSelect();
    }
    return new Promise((resolve) => {
        setTimeout(resolve, 500);
    });
};