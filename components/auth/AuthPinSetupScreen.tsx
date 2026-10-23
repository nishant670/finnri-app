import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getSecurityPinValidationError } from '@/lib/security';

type AuthPinSetupScreenProps = {
    onComplete: (pin: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    errorMessage?: string | null;
};

export const AuthPinSetupScreen = ({
    onComplete,
    onCancel,
    isLoading,
    errorMessage,
}: AuthPinSetupScreenProps) => {
    const theme = useThemeTokens();
    const { colors } = theme;
    // The two soft glows are tints of the page in light mode; on a dark page
    // the same pastels glare, so they become faint washes of the accent.
    const glowTop = theme.mode === 'dark' ? withAlpha(colors.accent, 0.08) : '#FCE4EC';
    const glowBottom = theme.mode === 'dark' ? withAlpha(colors.text, 0.04) : '#E3F2FD';
    const [step, setStep] = useState<'create' | 'confirm'>('create');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleDigitPress = (digit: string) => {
        if (isLoading) return;
        setError(null);

        if (step === 'create') {
            if (pin.length >= 4) return;
            const nextPin = pin + digit;
            setPin(nextPin);
            if (nextPin.length === 4) {
                const validationError = getSecurityPinValidationError(nextPin);
                if (validationError) {
                    setError(validationError);
                    setTimeout(() => {
                        setPin('');
                    }, 1000);
                    return;
                }
                setTimeout(() => setStep('confirm'), 300);
            }
        } else {
            if (confirmPin.length >= 4) return;
            const nextConfirmPin = confirmPin + digit;
            setConfirmPin(nextConfirmPin);
            if (nextConfirmPin.length === 4) {
                if (nextConfirmPin === pin) {
                    onComplete(pin);
                } else {
                    setError('PINs do not match. Try again.');
                    setTimeout(() => {
                        setStep('create');
                        setPin('');
                        setConfirmPin('');
                    }, 1000);
                }
            }
        }
    };

    const handleBackspace = () => {
        if (isLoading) return;
        if (step === 'create') {
            setPin(pin.slice(0, -1));
        } else {
            setConfirmPin(confirmPin.slice(0, -1));
        }
    };

    const currentPinLength = step === 'create' ? pin.length : confirmPin.length;
    const title = step === 'create' ? 'Create your PIN' : 'Confirm your PIN';
    const subtitle = step === 'create'
        ? 'This 4-digit code will keep your data private.'
        : "Just one more time to make sure it's correct.";

    return (
        <View style={[localStyles.container, { backgroundColor: colors.background }]}>
            {/* Back Button */}
            <TouchableOpacity onPress={onCancel} style={localStyles.backButton}>
                <MaterialCommunityIcons name="arrow-left" size={28} color={colors.text} />
            </TouchableOpacity>

            {/* Background Glows (Simulated) */}
            <View style={[localStyles.glowTop, { backgroundColor: glowTop }]} />
            <View style={[localStyles.glowBottom, { backgroundColor: glowBottom }]} />

            <View style={localStyles.headerSection}>
                <Text style={[localStyles.title, { color: colors.text }]}>{title}</Text>
                <Text style={[localStyles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
            </View>

            <View style={localStyles.dotsContainer}>
                {[0, 1, 2, 3].map((index) => {
                    const isFilled = currentPinLength > index;
                    const isActive = currentPinLength === index;
                    return (
                        <View
                            key={index}
                            style={[
                                localStyles.dotWrapper,
                                { backgroundColor: colors.card, borderColor: colors.border },
                                isActive && [localStyles.dotActive, { borderColor: theme.colors.accent }]
                            ]}
                        >
                            <View
                                style={[
                                    localStyles.dotInner,
                                    { backgroundColor: colors.borderStrong },
                                    isFilled && { backgroundColor: theme.colors.accent },
                                    isFilled && { width: 12, height: 12, borderRadius: 6 }
                                ]}
                            />
                        </View>
                    );
                })}
            </View>

            {error || errorMessage ? (
                <View style={localStyles.errorContainer}>
                    <Text style={[localStyles.errorText, { color: colors.negative }]}>{error || errorMessage}</Text>
                </View>
            ) : null}

            {isLoading && (
                <ActivityIndicator size="large" color={theme.colors.accent} style={{ marginBottom: 20 }} />
            )}

            <View style={localStyles.keypadContainer}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <TouchableOpacity
                        key={digit}
                        style={[localStyles.keyPadButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => handleDigitPress(digit)}
                        disabled={isLoading}
                    >
                        <Text style={[localStyles.keyPadText, { color: colors.text }]}>{digit}</Text>
                    </TouchableOpacity>
                ))}
                {/* Placeholder for alignment if needed, but screenshot shows 0 in middle */}
                <View style={localStyles.emptyKey} />

                <TouchableOpacity
                    style={[localStyles.keyPadButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleDigitPress('0')}
                    disabled={isLoading}
                >
                    <Text style={[localStyles.keyPadText, { color: colors.text }]}>0</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    accessibilityLabel="Delete last digit"
                    style={[localStyles.keyPadButton, { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 }]}
                    onPress={handleBackspace}
                    disabled={isLoading}
                >
                    <MaterialCommunityIcons name="backspace-outline" size={28} color={colors.muted} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const localStyles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 20,
    },
    backButton: {
        padding: 24,
        zIndex: 10,
    },
    glowTop: {
        position: 'absolute',
        top: -50,
        right: -50,
        width: 250,
        height: 250,
        borderRadius: 125,
        opacity: 0.5,
        zIndex: 0,
    },
    glowBottom: {
        position: 'absolute',
        bottom: '20%',
        left: -30,
        width: 200,
        height: 200,
        borderRadius: 100,
        opacity: 0.3,
        zIndex: 0,
    },
    headerSection: {
        alignItems: 'center',
        paddingHorizontal: 50,
        marginTop: 10,
        zIndex: 1,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 18,
        textAlign: 'center',
        lineHeight: 26,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginTop: 50,
        marginBottom: 60,
        zIndex: 1,
    },
    dotWrapper: {
        width: 68,
        height: 72,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 3,
    },
    dotActive: {
        borderWidth: 2.5,
    },
    dotInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    errorContainer: {
        paddingHorizontal: 40,
        marginBottom: 20,
        alignItems: 'center',
    },
    errorText: {
        fontSize: 14,
        fontWeight: '600',
    },
    keypadContainer: {
        paddingHorizontal: 30,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        zIndex: 1,
    },
    keyPadButton: {
        width: '30%',
        aspectRatio: 1.3,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderRadius: 24,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    keyPadText: {
        fontSize: 28,
        fontWeight: '700',
    },
    emptyKey: {
        width: '30%',
        aspectRatio: 1.3,
    }
});
