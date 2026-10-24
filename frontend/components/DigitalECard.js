// components/DigitalECard.js
import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
} from 'react-native';

/**
 * DigitalECard: An Apple Wallet-inspired digital identity pass.
 * Designed with premium typography, frosted glass borders, and reactive fields.
 * Supports direct screenshot capture via ViewShot ref.
 */
const DigitalECard = forwardRef(({
  docType = 'driving_licence',
  name = 'Cardholder',
  idNumber = '',
  photoBase64 = null,
  activeFields = [],
  isVerified = true,
}, ref) => {
  const isDL = docType === 'driving_licence';
  const isAadhaar = docType === 'aadhaar_card';
  const docTitle = isDL ? 'Driving Licence' : isAadhaar ? 'Aadhaar ID' : 'Identity Card';

  // Filter out the primary name and ID number since they are prominently displayed in the hero section
  const displayFields = activeFields.filter((f) => {
    if (f.isHidden) return false;
    const lowerKey = (f.key || f.label || '').toLowerCase();
    if (lowerKey.includes('name') && !lowerKey.includes('father') && !lowerKey.includes('husband')) return false;
    if (lowerKey.includes('licence number') || lowerKey.includes('aadhaar number') || lowerKey === 'id_number') return false;
    return true;
  });

  return (
    <View ref={ref} collapsable={false} style={styles.cardWrapper}>
      <View style={styles.cardContainer}>
        {/* Subtle decorative glow overlay */}
        <View style={styles.glowTopRight} />

        {/* 1. Header Bar: Logo & Document Type */}
        <View style={styles.cardHeader}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>C</Text>
            </View>
            <View>
              <Text style={styles.brandTitle}>CARTA</Text>
              <Text style={styles.brandSubtitle}>SECURE CREDENTIAL</Text>
            </View>
          </View>

          <View style={[styles.docTypePill, isAadhaar ? styles.docTypePillAadhaar : styles.docTypePillDL]}>
            <Text style={[styles.docTypePillText, isAadhaar ? styles.docTypeTextAadhaar : styles.docTypeTextDL]}>
              {docTitle.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* 2. Primary Hero: Photo + Name + Primary ID Number */}
        <View style={styles.heroRow}>
          {photoBase64 ? (
            <View style={styles.photoFrame}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
                style={styles.cardPhoto}
                resizeMode="cover"
              />
              <View style={styles.photoVerifiedDot} />
            </View>
          ) : (
            <View style={styles.placeholderFrame}>
              <Text style={styles.placeholderGlyph}>🪪</Text>
              <Text style={styles.placeholderText}>No Photo</Text>
            </View>
          )}

          <View style={styles.heroDetails}>
            <View style={styles.statusRow}>
              <View style={styles.verifiedChip}>
                <Text style={styles.verifiedCheck}>✓</Text>
                <Text style={styles.verifiedText}>Verified ID</Text>
              </View>
              <Text style={styles.nfcGlyph}>(((•)))</Text>
            </View>

            <Text style={styles.cardholderName} numberOfLines={2}>
              {name || 'CARDHOLDER'}
            </Text>

            <View style={styles.idBox}>
              <Text style={styles.idLabel}>
                {isDL ? 'LICENCE NO' : isAadhaar ? 'AADHAAR NO' : 'ID NO'}
              </Text>
              <Text style={styles.idValue} numberOfLines={1}>
                {idNumber || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Divider */}
        <View style={styles.hairlineDivider} />

        {/* 4. Secondary Attributes Grid (DOB, Dates, Custom fields) */}
        {displayFields.length > 0 && (
          <View style={styles.attributesGrid}>
            {displayFields.map((field, idx) => {
              const isFullWidth = field.fullWidth || (field.value && field.value.length > 28);
              return (
                <View
                  key={field.id || idx}
                  style={[
                    styles.attributeItem,
                    isFullWidth && styles.attributeItemFullWidth,
                  ]}
                >
                  <Text style={styles.attributeLabel} numberOfLines={1}>
                    {(field.label || '').toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.attributeValue,
                      field.isCustom && styles.attributeValueCustom,
                    ]}
                    numberOfLines={isFullWidth ? 3 : 2}
                  >
                    {field.displayValue || field.value || '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 5. Footer Security Stamp & Barcode Strip */}
        <View style={styles.cardFooter}>
          <View style={styles.barcodeStrip}>
            {/* Visual simulated micro-barcode for authentic digital credential feel */}
            <View style={styles.barcodePattern}>
              {[14, 28, 8, 22, 16, 30, 10, 26, 12, 20, 18, 24, 15, 29, 9, 21, 14, 27, 11, 23, 17, 25].map((h, i) => (
                <View key={i} style={[styles.barcodeBar, { height: h }]} />
              ))}
            </View>
          </View>
          <Text style={styles.footerSecurityText}>
            OFFICIALLY VERIFIED • LOCAL AI DECODE
          </Text>
        </View>
      </View>
    </View>
  );
});

export default DigitalECard;

const styles = StyleSheet.create({
  cardWrapper: {
    borderRadius: 22,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    marginVertical: 4,
  },
  cardContainer: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: '#0F172A',
    position: 'relative',
    overflow: 'hidden',
  },
  glowTopRight: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: -0.5,
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 8,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  docTypePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  docTypePillDL: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  docTypePillAadhaar: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  docTypePillText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  docTypeTextDL: {
    color: '#60A5FA',
  },
  docTypeTextAadhaar: {
    color: '#FBBF24',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoFrame: {
    width: 76,
    height: 98,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: '#1E293B',
    overflow: 'hidden',
    position: 'relative',
    marginRight: 16,
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  photoVerifiedDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  placeholderFrame: {
    width: 76,
    height: 98,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  placeholderGlyph: {
    fontSize: 22,
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
  },
  heroDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  verifiedCheck: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '900',
    marginRight: 4,
  },
  verifiedText: {
    color: '#A7F3D0',
    fontSize: 9.5,
    fontWeight: '600',
  },
  nfcGlyph: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardholderName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  idBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  idLabel: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  idValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.8,
  },
  hairlineDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12,
  },
  attributesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  attributeItem: {
    width: '48%',
    marginBottom: 10,
  },
  attributeItemFullWidth: {
    width: '100%',
  },
  attributeLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  attributeValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  attributeValueCustom: {
    color: '#93C5FD',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  barcodeStrip: {
    height: 22,
    justifyContent: 'center',
  },
  barcodePattern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  barcodeBar: {
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 1,
  },
  footerSecurityText: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.8,
  },
});
