// Keep the street network and administrative references quiet so REV's GPS
// overlays remain the main visual layer. Google's attribution stays untouched.
export const trackingMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#edf0f2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#73808a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f8fafb' }, { weight: 3 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e6ece8' }] },
  { featureType: 'landscape', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c5cdd2' }, { weight: 0.8 }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#596b78' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d4dce1' }, { weight: 0.5 }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7c8992' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#dce5eb' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#bac9d4' }, { weight: 0.8 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dce8f0' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8298a7' }] },
];
