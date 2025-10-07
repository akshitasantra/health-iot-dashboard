const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 🧹 Clear existing data first
  await prisma.reading.deleteMany();
  await prisma.device.deleteMany();
  await prisma.patient.deleteMany();

  console.log("✅ Cleared existing data");

  const patient1 = await prisma.patient.create({
  data: {
    name: "Alice",
    age: 30,
    devices: {
      create: [
        {
          name: "Heart Rate Sensor",
          battery: 100,   // initial battery
          readings: {
            create: [{ value: 72 }, { value: 75 }],
          },
        },
        {
          name: "Temperature Sensor",
          battery: 95,   // initial battery
          readings: {
            create: [{ value: 98.6 }, { value: 99.1 }],
          },
        },
      ],
    },
  },
});

const patient2 = await prisma.patient.create({
  data: {
    name: "Bob",
    age: 45,
    devices: {
      create: [
        {
          name: "Heart Rate Sensor",
          battery: 90,
          readings: {
            create: [{ value: 80 }, { value: 78 }],
          },
        },
        {
          name: "Temperature Sensor",
          battery: 85,
          readings: {
            create: [{ value: 97.9 }, { value: 99.4 }],
          },
        },
      ],
    },
  },
});


  console.log("✅ Seed complete:", { patient1, patient2 });
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
