import zipcodes from 'zipcodes'; export function zipToLatLon(zip:string){ const z:any=zipcodes.lookup(zip); if(!z) throw new Error('Invalid ZIP'); return { lat:z.latitude, lon:z.longitude }; }
