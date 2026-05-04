// Tipos compartidos entre main process y renderer

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  destination?: 'cocina' | 'barra' | null;
};

/**
 * Estado por destino. 'na' = el pedido no tiene items para ese destino
 * (ver migration 007 en Garum/supabase). El estado global `staff_status`
 * se deriva en la BD vía trigger; aquí lo conservamos por compatibilidad.
 */
export type StaffSubStatus = 'pending' | 'done' | 'na';

export type Order = {
  id: string;
  table_number: number;
  items: OrderItem[];
  total_amount: number;
  payment_status: 'pending' | 'paid' | 'cancelled';
  staff_status: 'pending' | 'done';
  staff_status_kitchen: StaffSubStatus;
  staff_status_bar:     StaffSubStatus;
  printed_at: string | null;
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
  /**
   * URL del proyecto Supabase. Si está vacío, la app no se conecta y
   * pide credenciales en la pantalla de Configuración.
   */
  supabaseUrl: string;
  /**
   * Anon key de Supabase. Antes estaba hardcoded en el repositorio:
   * ahora se lee de variables de entorno (`VITE_SUPABASE_URL` /
   * `VITE_SUPABASE_ANON_KEY`) o, si están vacías, del archivo
   * `config.json` que el usuario rellena en Configuración.
   */
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

/** Estado del modo mantenimiento publicado por la web (tabla `settings`). */
export type MaintenanceState = {
  enabled: boolean;
  message: string;
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
  CONFIG_RECONNECT:        'config:reconnect',
  CONNECTION_STATUS:       'connection:status',
  PRINTERS_LIST_WINDOWS:   'printers:list-windows',
  PRINTERS_SCAN_NETWORK:   'printers:scan-network',
  PRINTERS_TEST:           'printers:test',
  HISTORY_LIST:            'history:list',
  CONNECTION_GET:          'connection:get',
  MAINTENANCE_GET:         'maintenance:get',
  MAINTENANCE_CHANGED:     'maintenance:changed',
} as const;
