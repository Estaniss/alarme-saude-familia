import React from 'react';
import { Platform, Text, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { theme } from '../theme';

export function AdFooter() {
  const unitId = __DEV__ ? TestIds.BANNER : (process.env.EXPO_PUBLIC_ADMOB_BANNER_ID ?? '');
  if (!unitId) return null;
  return <View accessibilityLabel="Publicidade" style={{ alignItems: 'center', paddingVertical: 8, backgroundColor: theme.colors.surface }}>
    <Text style={{ color: theme.colors.muted, fontSize: 11, marginBottom: 4 }}>ANÚNCIO</Text>
    <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
  </View>;
}
