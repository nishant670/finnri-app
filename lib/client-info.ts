import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { Dimensions, Platform } from 'react-native';

/**
 * The app describes itself to the API on every request, so the admin
 * console can show which phones, app versions and builds people use, and keep
 * Google Play's pre-launch robots out of the user numbers. Nothing here
 * identifies the person: it is the app build and the phone model.
 *
 * Web builds send nothing extra (the browser's User-Agent says enough, and
 * the API's CORS list doesn't allow these headers).
 */

type TestLabModule = { isTestLabDevice?: () => boolean };

const nativeUpdates = requireOptionalNativeModule<TestLabModule>('FinnriUpdates');

type AndroidConstants = { Release?: string; Model?: string; Manufacturer?: string; Brand?: string };
type IOSConstants = { systemName?: string; osVersion?: string };

let cached: Record<string, string> | null = null;

const isTestLabDevice = () => {
  try {
    return nativeUpdates?.isTestLabDevice?.() === true;
  } catch {
    return false;
  }
};

const variant = () => {
  const id = Constants.expoConfig?.android?.package ?? Application.applicationId ?? '';
  if (id.endsWith('.preview')) return 'preview';
  if (id.endsWith('.debug')) return 'debug';
  return 'play';
};

const formFactor = () => {
  if (Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad) return 'tablet';
  const { width, height } = Dimensions.get('screen');
  // Android's own tablet line: the shorter side is 600dp or more.
  return Math.min(width, height) >= 600 ? 'tablet' : 'phone';
};

const titleCase = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

const device = () => {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as AndroidConstants;
    const maker = titleCase((constants.Manufacturer || constants.Brand || '').trim());
    const model = (constants.Model || '').trim();
    // "Samsung SM-S918B"; skip the maker when the model already starts with it ("Pixel 8" from Google stays "Google Pixel 8").
    return model.toLowerCase().startsWith(maker.toLowerCase()) ? model : `${maker} ${model}`.trim();
  }
  return (Platform as { isPad?: boolean }).isPad ? 'iPad' : 'iPhone';
};

const osName = () => {
  if (Platform.OS === 'android') {
    const release = (Platform.constants as AndroidConstants).Release;
    return release ? `Android ${release}` : 'Android';
  }
  const constants = Platform.constants as IOSConstants;
  return constants.osVersion ? `iOS ${constants.osVersion}` : 'iOS';
};

/** Headers describing this app install. Empty on web. Computed once per launch. */
export const clientHeaders = (): Record<string, string> => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return {};
  if (cached) return cached;
  const headers: Record<string, string> = {
    'X-Finnri-Platform': Platform.OS,
    'X-Finnri-App-Version': Application.nativeApplicationVersion ?? '',
    'X-Finnri-Build': Application.nativeBuildVersion ?? '',
    'X-Finnri-OS': osName(),
    'X-Finnri-Device': device(),
    'X-Finnri-Form-Factor': formFactor(),
    'X-Finnri-Variant': variant(),
  };
  if (isTestLabDevice()) headers['X-Finnri-Test-Device'] = '1';
  cached = headers;
  return headers;
};

/** For tests. */
export const resetClientHeadersForTest = () => {
  cached = null;
};

/**
 * Adds the client headers to a request's init without dropping anything the
 * caller set, including headers carried on a Request object. A header the
 * caller already set wins.
 */
export const withClientHeaders = (
  input: Parameters<typeof fetch>[0] | URL,
  init?: Parameters<typeof fetch>[1],
): Parameters<typeof fetch>[1] => {
  const extra = clientHeaders();
  if (Object.keys(extra).length === 0) return init;
  const base = init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined);
  const headers = new Headers(base);
  Object.entries(extra).forEach(([name, value]) => {
    if (value && !headers.has(name)) headers.set(name, value);
  });
  return { ...init, headers };
};
