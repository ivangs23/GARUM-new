// Tipos compartidos entre main process y renderer

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  destination?: 'cocina' | 'barra';
};

export type Order = {
  id: string;
  table_number: number;
  items: OrderItem[];
  total_amount: number;
  payment_status: 'pending' | 'paid' | 'cancelled';
  staff_status: 'pending' | 'done';
  created_at: string;
};

export type PrinterAdapter = 'escpos-tcp' | 'escpos-usb' | 'windows';

export type PrinterConfig = {
  id: string;
  label: string;
  destination: 'cocina' | 'barra' | 'all';
  adapter: PrinterAdapter;
  // escpos-tcp
  host?: string;
  port?: number;
  // escpos-usb
  vendorId?: string;
  productId?: string;
  // windows
  printerName?: string;
};

export type AppConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  printers: PrinterConfig[];
  autoLaunch: boolean;
  /** Subred base para el escáner de red. Ej: "192.168.1". Vacío = usar subredes por defecto. */
  scanSubnet: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type DiscoveredPrinter = {
  type: 'windows' | 'tcp';
  name?: string;   // Solo para type === 'windows'
  host?: string;   // Solo para type === 'tcp'
  port?: number;
};

// IPC channels — fuente única de verdad para evitar typos
export const IPC = {
  ORDERS_GET:              'orders:get',
  ORDERS_MARK_DONE:        'orders:mark-done',
  ORDERS_INIT:             'orders:init',
  ORDERS_NEW:              'orders:new',
  ORDERS_REMOVED:          'orders:removed',
  CONFIG_GET:              'config:get',
  CONFIG_SAVE:             'config:save',
  CONNECTION_STATUS:       'connection:status',
  PRINTERS_LIST_WINDOWS:   'printers:list-windows',
  PRINTERS_SCAN_NETWORK:   'printers:scan-network',
  PRINTERS_TEST:           'printers:test',
  HISTORY_LIST:            'history:list',
} as const;
