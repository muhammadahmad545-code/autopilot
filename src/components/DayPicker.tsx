import { Chip, useTheme } from '@basalt/core';
import React from 'react';
import { View } from 'react-native';
import { DAY_SHORT } from '../lib/describe';

export function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const { spacing } = useTheme();
  const all = days.length === 0;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      <Chip label="Every day" selected={all} onPress={() => onChange([])} />
      {DAY_SHORT.map((label, i) => {
        const day = i + 1;
        const selected = !all && days.includes(day);
        return (
          <Chip
            key={label}
            label={label}
            selected={selected}
            onPress={() => {
              const next = selected ? days.filter((d) => d !== day) : [...(all ? [] : days), day].sort();
              onChange(next.length === 7 ? [] : next);
            }}
          />
        );
      })}
    </View>
  );
}
