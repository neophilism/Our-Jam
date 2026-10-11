import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Wave } from "../../../packages/contracts/src/public";

export const colors = {
  bg: "#10100f",
  card: "#1d1e19",
  ink: "#f5f5e9",
  muted: "#b5b8a6",
  acid: "#d3fb58",
  line: "#414436",
};
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { padding: 20, paddingBottom: 40, gap: 16 },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.1,
  },
  heading: { color: colors.ink, fontSize: 23, fontWeight: "700" },
  label: {
    color: colors.acid,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  text: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 22,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  input: {
    color: colors.ink,
    backgroundColor: colors.bg,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 16,
    minHeight: 48,
  },
  button: {
    backgroundColor: colors.acid,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.line },
});
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function WaveScene({ waves }: { waves: Wave[] }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduced) {
      pulse.setValue(0);
      return;
    }
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2300,
          useNativeDriver: true,
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [pulse, reduced]);
  return (
    <View style={[styles.card, { overflow: "hidden", minHeight: 170 }]}>
      <Text style={styles.label}>THE SOUND WE'RE SHAPING</Text>
      <View style={styles.row}>
        {waves.slice(0, 4).map((wave, i) => (
          <Animated.View
            key={wave.id}
            style={{
              flexGrow: 1,
              flexBasis: "40%",
              borderColor: i % 2 ? "#60806b" : "#8ca739",
              borderWidth: 2,
              borderRadius: 60,
              padding: 15,
              backgroundColor: i % 2 ? "#223b31" : "#343f1c",
              transform: [
                {
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1.02],
                  }),
                },
              ],
            }}
          >
            <Text
              style={[styles.text, { fontWeight: "700", textAlign: "center" }]}
            >
              {wave.text}
            </Text>
            <Text style={[styles.muted, { textAlign: "center" }]}>
              {wave.votes} points
            </Text>
          </Animated.View>
        ))}
      </View>
      {!waves.length && (
        <Text style={styles.muted}>
          A quiet room. Your idea can start the first wave.
        </Text>
      )}
    </View>
  );
}
