import { DistributorPart, DistributorProvider } from './provider';

/**
 * Offline fixture catalogue so the app works without Octopart/Nexar credentials.
 * Values are approximate and for development only; always check the datasheet.
 */
const part = (p: Partial<DistributorPart> & Pick<DistributorPart, 'mpn' | 'manufacturer' | 'name' | 'category'>): DistributorPart => ({
  description: '',
  package_type: '',
  datasheet_url: '',
  lifecycle_status: 'active',
  stock: 1000,
  price: null,
  raw_specs: {},
  ...p,
});

export const MOCK_CATALOG: DistributorPart[] = [
  part({
    mpn: 'ESP32-WROOM-32', manufacturer: 'Espressif', name: 'ESP32-WROOM-32 Wi-Fi/BT module', category: 'mcu',
    description: 'Wi-Fi + Bluetooth MCU module', package_type: 'Module', price: 3.5, stock: 15000,
    raw_specs: { 'Supply Voltage': '3.0V ~ 3.6V', 'Supply Current': '500mA', 'Operating Temperature': '-40°C ~ 85°C', 'Size': '18 x 25.5 x 3.1 mm', 'Frequency': '240MHz' },
  }),
  part({
    mpn: 'ATMEGA328P-PU', manufacturer: 'Microchip', name: 'ATmega328P 8-bit AVR MCU', category: 'mcu',
    description: '8-bit AVR microcontroller, 32KB flash', package_type: 'DIP-28', price: 2.9, stock: 8000,
    raw_specs: { 'Supply Voltage': '1.8V ~ 5.5V', 'Supply Current': '200mA', 'Frequency': '20MHz', 'Operating Temperature': '-40°C ~ 85°C', 'Size': '34.8 x 7.6 x 4.6 mm' },
  }),
  part({
    mpn: 'STM32F407VGT6', manufacturer: 'STMicroelectronics', name: 'STM32F407VGT6 32-bit ARM Cortex-M4 MCU', category: 'mcu',
    description: 'ARM Cortex-M4, 168 MHz, 1MB flash, 192KB RAM', package_type: 'LQFP-100', price: 11.2, stock: 4200,
    raw_specs: { 'Supply Voltage': '1.8V ~ 3.6V', 'Supply Current': '240mA', 'Frequency': '168MHz', 'Operating Temperature': '-40°C ~ 85°C', 'Size': '14 x 14 x 1.6 mm' },
  }),
  part({
    mpn: 'LM7805', manufacturer: 'Texas Instruments', name: 'LM7805 5V 1.5A linear regulator', category: 'power',
    description: 'Positive 5V linear voltage regulator', package_type: 'TO-220', price: 0.55, stock: 62000,
    raw_specs: { 'Output Voltage': '5V', 'Output Current': '1.5A', 'Input Voltage': '7V ~ 25V', 'Operating Temperature': '0°C ~ 125°C', 'Size': '10.4 x 15.8 x 4.6 mm' },
  }),
  part({
    mpn: 'L7805CV', manufacturer: 'STMicroelectronics', name: 'L7805CV 5V 1.5A linear regulator', category: 'power',
    description: 'Positive 5V linear voltage regulator', package_type: 'TO-220', price: 0.6, stock: 40000,
    raw_specs: { 'Output Voltage': '5V', 'Output Current': '1.5A', 'Input Voltage': '7V ~ 35V', 'Operating Temperature': '0°C ~ 125°C', 'Size': '10.4 x 15.8 x 4.6 mm' },
  }),
  part({
    mpn: 'AMS1117-3.3', manufacturer: 'Advanced Monolithic Systems', name: 'AMS1117-3.3 3.3V 1A LDO', category: 'power',
    description: '3.3V low-dropout regulator', package_type: 'SOT-223', price: 0.12, stock: 120000,
    raw_specs: { 'Output Voltage': '3.3V', 'Output Current': '1A', 'Input Voltage': '4.75V ~ 15V', 'Size': '6.5 x 7 x 1.8 mm' },
  }),
  part({
    mpn: 'LM2596S-5.0', manufacturer: 'Texas Instruments', name: 'LM2596 5V 3A buck converter', category: 'power',
    description: 'Step-down switching regulator, 5V fixed', package_type: 'TO-263', price: 2.1, stock: 9000,
    raw_specs: { 'Output Voltage': '5V', 'Output Current': '3A', 'Input Voltage': '7V ~ 40V', 'Frequency': '150kHz', 'Size': '10.2 x 15 x 4.6 mm' },
  }),
  part({
    mpn: 'BME280', manufacturer: 'Bosch Sensortec', name: 'BME280 humidity/pressure/temperature sensor', category: 'sensor',
    description: 'Environmental sensor, I2C/SPI', package_type: 'LGA-8', price: 4.2, stock: 7000,
    raw_specs: { 'Supply Voltage': '1.71V ~ 3.6V', 'Supply Current': '1mA', 'Operating Temperature': '-40°C ~ 85°C', 'Size': '2.5 x 2.5 x 0.93 mm' },
  }),
  part({
    mpn: 'SSD1306-OLED-128X64', manufacturer: 'Solomon Systech', name: 'SSD1306 0.96" OLED display module', category: 'display',
    description: '128x64 I2C OLED module', package_type: 'Module', price: 2.5, stock: 20000,
    raw_specs: { 'Supply Voltage': '3.3V ~ 5V', 'Supply Current': '20mA', 'Size': '27 x 27 x 4 mm' },
  }),
  part({
    mpn: 'HC-SR04', manufacturer: 'Generic', name: 'HC-SR04 ultrasonic distance sensor', category: 'sensor',
    description: 'Ultrasonic ranging module', package_type: 'Module', price: 1.5, stock: 30000,
    raw_specs: { 'Supply Voltage': '5V', 'Supply Current': '15mA', 'Size': '45 x 20 x 15 mm' },
  }),
  part({
    mpn: 'SG90', manufacturer: 'TowerPro', name: 'SG90 micro servo', category: 'actuator',
    description: '9g micro servo', package_type: 'Module', price: 2.0, stock: 12000,
    raw_specs: { 'Supply Voltage': '4.8V ~ 6V', 'Supply Current': '650mA', 'Size': '22.5 x 12 x 27 mm' },
  }),
  part({
    mpn: 'NE555P', manufacturer: 'Texas Instruments', name: 'NE555 precision timer', category: 'ic',
    description: 'Single timer', package_type: 'DIP-8', price: 0.4, stock: 50000, lifecycle_status: 'nrnd',
    raw_specs: { 'Supply Voltage': '4.5V ~ 16V', 'Supply Current': '15mA', 'Size': '9.8 x 6.4 x 4.5 mm' },
  }),
];

export class MockProvider implements DistributorProvider {
  readonly name = 'mock';
  async search(query: string, limit: number) {
    const q = query.trim().toLowerCase();
    return MOCK_CATALOG.filter((p) => p.mpn.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, limit);
  }
}
