import { cssInterop } from 'nativewind';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export const TView = cssInterop(ThemedView, { className: 'style' });

export const TText = cssInterop(ThemedText, { className: 'style' });
