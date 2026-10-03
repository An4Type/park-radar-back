import 'dotenv/config';
import { prisma } from '../src/client.js';

const parkings = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Stary Browar', address: 'Półwiejska 42, Poznań', latitude: 52.4009, longitude: 16.9281, totalSpaces: 320, occupiedSpaces: 170 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Posnania', address: 'Pleszewska 1, Poznań', latitude: 52.3970, longitude: 16.9542, totalSpaces: 500, occupiedSpaces: 290 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Avenida Poznań', address: 'Matyi 2, Poznań', latitude: 52.4004, longitude: 16.9128, totalSpaces: 230, occupiedSpaces: 120 },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Galeria Malta', address: 'Maltańska 1, Poznań', latitude: 52.4082, longitude: 16.9616, totalSpaces: 180, occupiedSpaces: 65 },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Plac Wolności', address: 'Plac Wolności 18, Poznań', latitude: 52.4091, longitude: 16.9254, totalSpaces: 95, occupiedSpaces: 55 },
];

try {
  for (const parking of parkings) {
    await prisma.parking.upsert({
      where: { id: parking.id },
      update: { name: parking.name, address: parking.address, latitude: parking.latitude, longitude: parking.longitude, totalSpaces: parking.totalSpaces },
      create: parking,
    });
  }
  console.log(JSON.stringify({ service: 'seed', event: 'complete', count: parkings.length }));
} finally {
  await prisma.$disconnect();
}
