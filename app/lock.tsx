import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthPinLoginScreen } from '@/components/auth/AuthPinLoginScreen';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { loginUser } from '@/lib/auth';
import { getDeviceId } from '@/lib/device';
import { hasLocalSecurityPin, saveLocalSecurityPin, verifyLocalSecurityPin } from '@/lib/security';

export default function LockScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { user, setAuth, clearAuth } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUnlock = async (pin: string) => {
        if (!user) {
            clearAuth();
            router.replace('/auth');
            return;
        }

        if (pin === 'biometric_success') {
            router.replace('/(tabs)');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            if (await hasLocalSecurityPin(user.uuid)) {
                if (await verifyLocalSecurityPin(user.uuid, pin)) {
                    router.replace('/(tabs)');
                    return;
                }

                setError('Incorrect PIN.');
                return;
            }

            const identifier = user.email || user.phone;
            if (!identifier) {
                setError('Incorrect PIN.');
                return;
            }

            const deviceId = await getDeviceId();
            const response = await loginUser({
                identifier: identifier,
                pin: pin,
                device_id: deviceId,
            });

            await saveLocalSecurityPin(response.user.uuid, pin);
            setAuth(
                {
                    ...response.user,
                    has_pin: true,
                    biometrics_enabled: user.biometrics_enabled,
                    email: identifier.includes('@') ? identifier : user.email,
                    phone: identifier.includes('@') ? user.phone : identifier,
                    stealth_mode: user.stealth_mode,
                },
                response.token
            );
            router.replace('/(tabs)');
        } catch (err) {
            setError(getFriendlyErrorMessage(err, "Couldn't unlock. If you've reset your account, tap Switch account."));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
            <AuthPinLoginScreen
                onContinue={handleUnlock}
                onSecondary={() => {
                    clearAuth(); // Clear stale user data
                    router.replace('/auth');
                }}
                isLoading={isLoading}
                errorMessage={error}
            />
        </SafeAreaView>
    );
}
