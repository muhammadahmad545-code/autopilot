import { Card, Header, Screen, Text, useTheme } from '@basalt/core';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { TRIGGER_ICONS } from '../components/icons';
import { summarize } from '../lib/describe';
import { RECIPES } from '../lib/recipes';

export default function Recipes() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <Header title="Recipes" subtitle="Ready-made rules you can adjust" onBack={() => router.back()} />
      {RECIPES.map((recipe) => {
        const Icon = TRIGGER_ICONS[recipe.rule.trigger.type];
        return (
          <Card
            key={recipe.id}
            onPress={() => router.push({ pathname: '/rule/[id]', params: { id: 'new', recipe: recipe.id } })}
            accessibilityLabel={`${recipe.title}. ${recipe.blurb}`}
            style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
          >
            <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{recipe.title}</Text>
              <Text variant="caption" color="textMuted">
                {recipe.blurb}
              </Text>
              <Text variant="caption" color="accent" numberOfLines={1}>
                {summarize({ ...recipe.rule, id: '', enabled: true, createdAt: 0 })}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </Card>
        );
      })}
    </Screen>
  );
}
