/// <reference types="vite/client" />

import type {
  AppConfig,
  Order,
  PrinterConfig,
  DiscoveredPrinter,
  MaintenanceState,
  UpdaterStatus,
} from '../../shared/types';

declare global {
  interface Window {
    api: {
      getOrders:            ()                          => Promise<Order[]>;
      markDone:             (
        payload: string | { id: string; destination: 'cocina' | 'barra' },
      ) => Promise<void>;
      getConfig:            ()                          => Promise<AppConfig>;
      saveConfig:           (c: AppConfig)              => Promise<void>;
      reconnect:            ()                          => Promise<void>;
      onOrdersInit:         (cb: (o: Order[]) => void)  => void;
      onNewOrder:           (cb: (o: Order)  => void)   => void;
      onOrderRemoved:       (cb: (id: string) => void)  => void;
      onConnectionStatus:   (cb: (s: string) => void)   => void;
      onMaintenanceChanged: (cb: (m: MaintenanceState) => void) => void;
      onPrintError:         (cb: (err: { orderId: string; mesa: number; reason: string }) => void) => void;
      off:                  (channel: string)           => void;
      listWindowsPrinters:  ()                          => Promise<DiscoveredPrinter[]>;
      scanNetworkPrinters:  ()                          => Promise<DiscoveredPrinter[]>;
      testPrinter:          (c: PrinterConfig)          => Promise<void>;
      listHistory:          (limit: number, offset: number) => Promise<Order[]>;
      getConnectionStatus:  ()                          => Promise<string>;
      getMaintenance:       ()                          => Promise<MaintenanceState>;
      getAppVersion:        ()                          => Promise<string>;
      getUpdaterStatus:     ()                          => Promise<UpdaterStatus>;
      checkForUpdate:       ()                          => Promise<void>;
      installUpdate:        ()                          => Promise<void>;
      onUpdaterStatus:      (cb: (s: UpdaterStatus) => void) => void;
    };
  }
}
