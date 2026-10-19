import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { PressableView } from '@/components/ui/PressableView';
import { ReceiptSourceSheet } from '@/components/transactions/ReceiptSourceSheet';

// NativeWind drops a `style={({ pressed }) => …}` callback on a device, and
// every rule in it: the bill-scan sheet's rows lost their layout and labels.
// PressableView takes plain styles and lays the pressed look over them.
describe('PressableView', () => {
  it('keeps its layout always and adds the pressed look only while pressed', async () => {
    const onPressIn = jest.fn();
    const screen = await render(
      <PressableView
        testID="target"
        onPressIn={onPressIn}
        style={{ flexDirection: 'row', padding: 12 }}
        pressedStyle={{ opacity: 0.5 }}>
        <Text>Take a photo</Text>
      </PressableView>
    );
    const target = () => StyleSheet.flatten(screen.getByTestId('target').props.style);
    expect(target()).toMatchObject({ flexDirection: 'row', padding: 12 });
    expect(target().opacity).toBeUndefined();

    await fireEvent(screen.getByTestId('target'), 'pressIn');
    expect(target()).toMatchObject({ flexDirection: 'row', opacity: 0.5 });
    expect(onPressIn).toHaveBeenCalledTimes(1);

    await fireEvent(screen.getByTestId('target'), 'pressOut');
    expect(target().opacity).toBeUndefined();
  });
});

describe('ReceiptSourceSheet', () => {
  it('lays each choice out as a row with its label and hint', async () => {
    const onChoose = jest.fn();
    const screen = await render(
      <ReceiptSourceSheet visible onChoose={onChoose} onClose={jest.fn()} />
    );
    const camera = screen.getByTestId('receipt-source-camera');
    expect(StyleSheet.flatten(camera.props.style)).toMatchObject({ flexDirection: 'row' });
    expect(screen.getByText('Take a photo')).toBeTruthy();
    expect(screen.getByText('A bill or payment screenshot you already have')).toBeTruthy();
    await fireEvent.press(screen.getByText('Choose a photo'));
    expect(onChoose).toHaveBeenCalledWith('library');
  });
});
