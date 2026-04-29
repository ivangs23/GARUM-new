/**
 * Tests del helper de routing cocina/barra. Usan el test runner nativo
 * de Node (`node --test`) — no requieren instalar vitest/jest.
 *
 * Ejecutar:
 *   npx tsx --test tests/unit/order-routing.test.ts
 * o, si tienes Node 22+:
 *   node --experimental-strip-types --test tests/unit/order-routing.test.ts
 *
 * Estos tests son la versión gemela de los del desktop:
 *   garum-desktop/tests/unit/order-routing.test.ts
 * Si añades un caso aquí, añádelo también allí. La fuente de verdad del
 * helper es lib/order-routing.ts en este repo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterItems,
  hasItemsFor,
  effectiveDestination,
  normalize,
  BARRA_KEYWORDS,
} from "../../lib/order-routing.ts";

describe("normalize", () => {
  it("quita acentos y baja a minúsculas", () => {
    assert.equal(normalize("CafÉ con LECHE"), "cafe con leche");
    assert.equal(normalize("Cóctel de naranja"), "coctel de naranja");
    assert.equal(normalize("Caña"), "cana");
    assert.equal(normalize("Infusión de menta"), "infusion de menta");
  });

  it("respeta strings ya normalizados", () => {
    assert.equal(normalize("vino tinto"), "vino tinto");
  });
});

describe("effectiveDestination — explícito gana", () => {
  it("respeta destination=cocina aunque el nombre sea de bebida", () => {
    assert.equal(effectiveDestination({ name: "Vino tinto", destination: "cocina" }), "cocina");
  });

  it("respeta destination=barra aunque el nombre sea de comida", () => {
    assert.equal(effectiveDestination({ name: "Croquetas", destination: "barra" }), "barra");
  });
});

describe("effectiveDestination — fallback por keywords", () => {
  it("manda a barra los items con keyword de bebida", () => {
    assert.equal(effectiveDestination({ name: "Vino Tempranillo" }), "barra");
    assert.equal(effectiveDestination({ name: "Café espresso" }), "barra");
    assert.equal(effectiveDestination({ name: "Cafe (sin tilde)" }), "barra");
    assert.equal(effectiveDestination({ name: "Cóctel margarita" }), "barra");
    assert.equal(effectiveDestination({ name: "Coctel margarita" }), "barra");
    assert.equal(effectiveDestination({ name: "Caña doble" }), "barra");
    assert.equal(effectiveDestination({ name: "Infusión digestiva" }), "barra");
    assert.equal(effectiveDestination({ name: "Cava brut" }), "barra");
    assert.equal(effectiveDestination({ name: "Champán" }), "barra");
  });

  it("deja en cocina lo que no matchea", () => {
    assert.equal(effectiveDestination({ name: "Croquetas de jamón" }), "cocina");
    assert.equal(effectiveDestination({ name: "Tabla de quesos" }), "cocina");
    assert.equal(effectiveDestination({ name: "Tortilla" }), "cocina");
  });

  it("destination null/undefined cae al fallback", () => {
    assert.equal(effectiveDestination({ name: "Vino", destination: null }), "barra");
    assert.equal(effectiveDestination({ name: "Vino", destination: undefined }), "barra");
  });
});

describe("filterItems", () => {
  const items = [
    { name: "Croquetas", destination: "cocina" as const },
    { name: "Vino Rioja", destination: "barra" as const },
    { name: "Café" /* legacy */ },
    { name: "Tortilla" /* legacy */ },
  ];

  it("cocina devuelve solo items de cocina", () => {
    assert.deepEqual(
      filterItems(items, "cocina").map((i) => i.name),
      ["Croquetas", "Tortilla"]
    );
  });

  it("barra devuelve solo items de barra", () => {
    assert.deepEqual(
      filterItems(items, "barra").map((i) => i.name),
      ["Vino Rioja", "Café"]
    );
  });
});

describe("hasItemsFor", () => {
  it("detecta cocina y barra a la vez", () => {
    const items = [
      { name: "Croquetas", destination: "cocina" as const },
      { name: "Vino", destination: "barra" as const },
    ];
    assert.equal(hasItemsFor(items, "cocina"), true);
    assert.equal(hasItemsFor(items, "barra"), true);
  });

  it("un pedido solo de barra no aparece en cocina", () => {
    const items = [{ name: "Vino", destination: "barra" as const }];
    assert.equal(hasItemsFor(items, "cocina"), false);
    assert.equal(hasItemsFor(items, "barra"), true);
  });

  it("lista vacía siempre falsa", () => {
    assert.equal(hasItemsFor([], "cocina"), false);
    assert.equal(hasItemsFor([], "barra"), false);
  });
});

describe("BARRA_KEYWORDS", () => {
  it("todos los keywords están normalizados (sin acentos, lowercase)", () => {
    for (const kw of BARRA_KEYWORDS) {
      assert.equal(kw, normalize(kw), `keyword "${kw}" no está normalizado`);
    }
  });
});
