// components/DigitalECard.js
import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
} from 'react-native';
import { QrCode, User, Camera } from 'lucide-react-native';

/**
 * DigitalECard: Clean, elegant off-white Apple Wallet-style digital identity pass.
 * Features light ceramic/frosted finish, crisp typography, and live-reactive fields.
 * Supports high-resolution snapshot capture via forwardRef.
 */
const DigitalECard = forwardRef(({
  docType = 'driving_licence',
  name = 'Cardholder',
  idNumber = '',
  photoUri = null,
  gender = '',
  activeFields = [],
  onPhotoPress = null,
}, ref) => {
  const isDL = docType === 'driving_licence';
  const isAadhaar = docType === 'aadhaar_card';
  const docTitle = isDL ? 'Driving Licence' : isAadhaar ? 'Aadhaar ID' : 'Identity Card';

  // Format photo source whether base64 raw or file/http URI
  const imageSource = photoUri
    ? {
        uri:
          photoUri.startsWith('data:') ||
          photoUri.startsWith('file:') ||
          photoUri.startsWith('http')
            ? photoUri
            : `data:image/jpeg;base64,${photoUri}`,
      }
    : null;

  // Filter out the primary name and ID number so they are NEVER duplicated in the secondary grid
  const displayFields = activeFields.filter((f) => {
    if (f.isHidden) return false;
    const lowerKey = (f.key || '').toLowerCase();
    const lowerLabel = (f.label || '').toLowerCase();

    // Skip cardholder primary name (shown in hero)
    if (lowerKey === 'name' || lowerLabel === 'full name') return false;

    // Skip licence / Aadhaar numbers (shown in hero id box)
    if (
      lowerKey.includes('licence') ||
      lowerKey.includes('license') ||
      lowerKey.includes('aadhaar') ||
      lowerKey === 'id_number' ||
      lowerLabel.includes('licence number') ||
      lowerLabel.includes('aadhaar number')
    ) {
      return false;
    }

    return true;
  });

  const PhotoComponent = onPhotoPress ? TouchableOpacity : View;

  return (
    <View ref={ref} collapsable={false} style={styles.cardWrapper}>
      <View style={styles.cardContainer}>
        {/* 1. Header Bar: Brand Logo & Document Type */}
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

          <View style={styles.docTypePill}>
            <Text style={styles.docTypePillText}>
              {docTitle.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* 2. Primary Hero: Portrait Photo + Name + Primary ID Number */}
        <View style={styles.heroRow}>
          <PhotoComponent
            style={styles.photoTouchable}
            onPress={onPhotoPress}
            activeOpacity={0.8}
            disabled={!onPhotoPress}
          >
            {imageSource ? (
              <View style={styles.photoFrame}>
                <Image
                  source={imageSource}
                  style={styles.cardPhoto}
                  resizeMode="cover"
                />
                {onPhotoPress && (
                  <View style={styles.photoEditBadge}>
                    <Camera size={11} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.placeholderFrame}>
                <View style={styles.avatarCircle}>
                  <User size={34} color="#64748B" strokeWidth={1.5} />
                </View>
                <Text style={styles.placeholderText}>
                  {gender && (gender.toLowerCase().includes('f') || gender.toLowerCase().includes('female'))
                    ? 'FEMALE'
                    : 'PHOTO'}
                </Text>
                {onPhotoPress && (
                  <View style={styles.photoEditBadge}>
                    <Camera size={11} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                )}
              </View>
            )}
          </PhotoComponent>

          <View style={styles.heroDetails}>
            <Text style={styles.cardholderName} numberOfLines={2}>
              {name || 'CARDHOLDER'}
            </Text>

            <View style={styles.idBox}>
              <Text style={styles.idLabel}>
                {isDL ? 'LICENCE NO.' : isAadhaar ? 'AADHAAR NO.' : 'ID NO.'}
              </Text>
              <Text style={styles.idValue} numberOfLines={1}>
                {idNumber || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Hairline Divider */}
        <View style={styles.hairlineDivider} />

        {/* 4. Secondary Attributes Grid (Dates, Address, Custom Fields) */}
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

        {/* 5. Minimalist Elegant Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.footerCenterRow}>
            <QrCode size={12} color="#94A3B8" strokeWidth={1.75} />
            <Text style={styles.footerSecurityText}>CARTA SECURE ID</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default DigitalECard;

const styles = StyleSheet.create({
  cardWrapper: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    marginVertical: 4,
  },
  cardContainer: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFC',
    position: 'relative',
    overflow: 'hidden',
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
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandBadgeText: {
    color: '#1E293B',
    fontWeight: '800',
    fontSize: 16,
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  docTypePill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  docTypePillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.6,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoTouchable: {
    marginRight: 16,
  },
  photoFrame: {
    width: 78,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    position: 'relative',
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderFrame: {
    width: 78,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 8.5,
    color: '#94A3B8',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  cardholderName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  idBox: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  idLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  idValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: 0.6,
  },
  hairlineDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  attributesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  attributeItem: {
    width: '48%',
    marginBottom: 12,
  },
  attributeItemFullWidth: {
    width: '100%',
  },
  attributeLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  attributeValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  attributeValueCustom: {
    color: '#1E40AF',
  },
  cardFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footerCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerSecurityText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1.2,
  },
});
