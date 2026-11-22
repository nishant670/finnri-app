import { memo, useId, useMemo, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  CARD_H,
  CARD_W,
  cardTone,
  compactMarks,
  drawingMarks,
  type CardArt,
  type CardTone,
  type Mark,
} from '@/lib/card-art';

/*
 * A sketch card (canvas Round 18, P91–P94): the real card's idea drawn as pen
 * lines in the app's own colours, with the bank, card name, network and last
 * four as plain text. No logos of any kind.
 *
 * A port of `sketchCard()` in docs/redesign/sketch-cards/lib.mjs. Everything
 * is laid out in the canvas's 342×216 box (216×342 for a portrait card) and
 * scaled, so a card reads the same at every width.
 */

export type SketchCardFigure = {
  /** "₹8,412", "No bill", "₹0". */
  amount: string;
  /** "DUE 18 NOV". Set in capitals on the card. */
  sub: string;
};

type SketchCardProps = {
  art: CardArt;
  bank: string;
  /** The card's product name; blank for a card not in the catalogue. */
  product?: string;
  last4?: string;
  /** Plain text: "Visa", "RuPay". */
  network?: string;
  holder?: string;
  width: number;
  /** All cards list: the amount top right, with the drawing cleared under it and the button. */
  figure?: SketchCardFigure | null;
  /** Thumbnails: no text, no second pen pass. */
  bare?: boolean;
  /** Drawn over the card, positioned in card units by the caller (the list's button). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const FONT = Platform.OS === 'web' ? Fonts?.sans : undefined;

/** Height for a width, in the card's own proportions. */
export function sketchCardHeight(width: number, portrait: boolean) {
  return Math.round(((width * (portrait ? CARD_W : CARD_H)) / (portrait ? CARD_H : CARD_W)) * 100) / 100;
}

/** Where the list's button sits, in card units from the card's top-left. */
export function sketchCardButtonBox(portrait: boolean): { right: number; height: number } & (
  | { top: number; bottom?: undefined }
  | { bottom: number; top?: undefined }
) {
  return portrait ? { right: 12, top: 252, height: 36 } : { right: 14, bottom: 14, height: 36 };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function MarkView({ mark, index }: { mark: Mark; index: number }) {
  if (mark.k === 'group') {
    return (
      <G transform={mark.transform}>
        {mark.marks.map((child, childIndex) => (
          <MarkView key={childIndex} mark={child} index={childIndex} />
        ))}
      </G>
    );
  }
  if (mark.k === 'dot') {
    return (
      <Path
        key={index}
        d={`M${mark.cx - mark.r} ${mark.cy}a${mark.r} ${mark.r} 0 1 0 ${mark.r * 2} 0a${mark.r} ${mark.r} 0 1 0 ${-mark.r * 2} 0`}
        fill={mark.fill}
        fillOpacity={clamp(mark.opacity)}
      />
    );
  }
  return (
    <Path
      d={mark.d}
      fill={mark.fill ?? 'none'}
      fillOpacity={mark.fill ? clamp(mark.fillOpacity ?? 0.14) : undefined}
      stroke={mark.stroke}
      strokeWidth={mark.width}
      strokeOpacity={clamp(mark.opacity)}
      strokeLinecap="round"
      strokeLinejoin={mark.round ? 'round' : undefined}
      strokeDasharray={mark.dash}
      transform={mark.ghost ? 'translate(0.9 0.7)' : undefined}
    />
  );
}

const Drawing = memo(function Drawing({ marks }: { marks: Mark[] }) {
  return (
    <>
      {marks.map((mark, index) => (
        <MarkView key={index} mark={mark} index={index} />
      ))}
    </>
  );
});

function SketchCardBase({
  art,
  bank,
  product,
  last4,
  network,
  holder,
  width,
  figure,
  bare = false,
  children,
  style,
  testID,
}: SketchCardProps) {
  const { mood, mode } = useThemeTokens();
  const t: CardTone = useMemo(() => cardTone(mood.themeColor, mode, art.tone), [art.tone, mode, mood.themeColor]);
  const marks = useMemo(
    () => compactMarks(drawingMarks(art.drawing, art.portrait, t), { thumb: bare }),
    [art.drawing, art.portrait, bare, t]
  );
  // Ids are per card: two cards on one screen must not share a gradient.
  const id = `k${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const portrait = art.portrait;
  const VW = portrait ? CARD_H : CARD_W;
  const VH = portrait ? CARD_W : CARD_H;
  const height = sketchCardHeight(width, portrait);

  const cy = portrait ? 228 : 80;
  const ny = portrait ? 300 : 170;
  const hy = portrait ? 322 : 195;
  const figureX = VW - 22;
  const figureY = portrait ? 80 : 36;
  const digits = last4 ? `•• ${last4}` : 'Add last 4';
  const label = `${bank}${product ? ` ${product}` : ''} card${last4 ? ` ending ${last4}` : ''}`;

  return (
    <View
      testID={testID}
      accessible={!children}
      accessibilityRole={children ? undefined : 'image'}
      accessibilityLabel={label}
      style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`}>
        <Defs>
          <LinearGradient id={`${id}g`} x1="0%" y1="0%" x2="55%" y2="100%">
            <Stop offset="0" stopColor={t.top} />
            <Stop offset="1" stopColor={t.bot} />
          </LinearGradient>
          <RadialGradient id={`${id}l`} cx="12%" cy="-15%" r="110%" fx="12%" fy="-15%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          {/* The drawing fades out on the side the text sits. */}
          {portrait ? (
            <LinearGradient id={`${id}f`} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0.02" stopColor="#FFFFFF" stopOpacity={0.35} />
              <Stop offset="0.12" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.72" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          ) : (
            <LinearGradient id={`${id}f`} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0.22" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={1} />
            </LinearGradient>
          )}
          {figure ? (
            <RadialGradient id={`${id}q`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor="#000000" stopOpacity={1} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          ) : null}
          <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={VW} height={VH}>
            <Rect x="0" y="0" width={VW} height={VH} fill={`url(#${id}f)`} />
            {/* On the list, two soft holes keep the amount and the button readable. */}
            {figure && !portrait ? (
              <>
                <Ellipse cx={300} cy={34} rx={92} ry={44} fill={`url(#${id}q)`} />
                <Ellipse cx={292} cy={190} rx={92} ry={42} fill={`url(#${id}q)`} />
              </>
            ) : null}
            {figure && portrait ? (
              <>
                <Ellipse cx={150} cy={84} rx={86} ry={40} fill={`url(#${id}q)`} />
                <Ellipse cx={150} cy={270} rx={86} ry={38} fill={`url(#${id}q)`} />
              </>
            ) : null}
          </Mask>
          <ClipPath id={`${id}c`}>
            <Rect x="0" y="0" width={VW} height={VH} rx={14} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${id}c)`}>
          <Rect x="0" y="0" width={VW} height={VH} fill={`url(#${id}g)`} />
          <Rect x="0" y="0" width={VW} height={VH} fill={`url(#${id}l)`} />
          <G mask={`url(#${id}m)`}>
            <Drawing marks={marks} />
          </G>
          {bare ? null : (
            <>
              <SvgText x={22} y={34} fontFamily={FONT} fontSize={16} fontWeight="700" fill={t.text}>
                {bank}
              </SvgText>
              {product ? (
                <SvgText x={22} y={50} fontFamily={FONT} fontSize={9} fontWeight="600" letterSpacing={1.6} fill={t.soft}>
                  {product.toUpperCase()}
                </SvgText>
              ) : null}
              {/* The chip, drawn as a line diagram like everything else. */}
              <G
                fill="none"
                stroke={t.text}
                strokeOpacity={0.62}
                strokeWidth={1.2}
                strokeLinecap="round"
                transform={`translate(0 ${cy - 80})`}>
                <Rect x={22} y={80} width={40} height={30} rx={6} />
                <Path d="M22 91h11 M22 99h11 M51 91h11 M51 99h11 M33 80v30 M51 80v30" />
              </G>
              <SvgText x={22} y={ny} fontFamily={FONT} fontSize={13} fontWeight="500" letterSpacing={0.4} fill={t.text}>
                {`${network ? `${network}  ` : ''}${digits}`}
              </SvgText>
              {holder ? (
                <SvgText x={22} y={hy} fontFamily={FONT} fontSize={11} fontWeight="600" letterSpacing={1.6} fill={t.soft}>
                  {holder.toUpperCase()}
                </SvgText>
              ) : null}
              {figure ? (
                <>
                  <SvgText
                    x={figureX}
                    y={figureY}
                    textAnchor="end"
                    fontFamily={FONT}
                    fontSize={21}
                    fontWeight="800"
                    fill={t.text}>
                    {figure.amount}
                  </SvgText>
                  <SvgText
                    x={figureX}
                    y={figureY + 17}
                    textAnchor="end"
                    fontFamily={FONT}
                    fontSize={11}
                    fontWeight="600"
                    letterSpacing={0.4}
                    fill={t.soft}>
                    {figure.sub.toUpperCase()}
                  </SvgText>
                </>
              ) : null}
            </>
          )}
          <Rect
            x={0.6}
            y={0.6}
            width={VW - 1.2}
            height={VH - 1.2}
            rx={13.5}
            fill="none"
            stroke={t.edge}
            strokeWidth={1.2}
          />
        </G>
      </Svg>
      {children ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

export const SketchCard = memo(SketchCardBase);

/** The tone's button colours, for a button drawn over a card. */
export function useSketchCardTone(art: CardArt) {
  const { mood, mode } = useThemeTokens();
  return useMemo(() => cardTone(mood.themeColor, mode, art.tone), [art.tone, mode, mood.themeColor]);
}
