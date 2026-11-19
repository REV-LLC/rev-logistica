export function getAttendanceLocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este celular no permite obtener la ubicación. Pide ayuda al encargado.'));
    navigator.geolocation.getCurrentPosition(resolve, error => reject(new Error(
      error.code === 1 ? 'No tenemos permiso de ubicación. Pide ayuda al encargado.' : 'No encontramos tu ubicación. Acércate a un lugar despejado y vuelve a intentar.',
    )), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
