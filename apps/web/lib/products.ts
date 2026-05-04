export const CATEGORIES_MOCK = [
  {
    id: 'cat_wine_red',
    name: 'Vinos Tintos',
    slug: 'tintos',
    icon: 'Wine',
    products: [
      {
        id: 'p_t1',
        name: 'Ribera del Duero Reserva',
        description: '18 meses en barrica. Notas de frutos negros y especias.',
        price: 32.00,
        image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [12],
        product_extras: []
      },
      {
        id: 'p_t2',
        name: 'Rioja Gran Reserva',
        description: 'Clásico con toques de vainilla, cuero y final largo.',
        price: 38.50,
        image_url: 'https://images.unsplash.com/photo-1553122912-78d9bb651759?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [12],
        product_extras: []
      }
    ]
  },
  {
    id: 'cat_wine_white',
    name: 'Vinos Blancos',
    slug: 'blancos',
    icon: 'Wine',
    products: [
      {
        id: 'p_b1',
        name: 'Albariño Rías Baixas',
        description: 'Aromas frutales, equilibrado y muy fresco.',
        price: 24.50,
        image_url: 'https://images.unsplash.com/photo-1559113513-d5e09c78b9dd?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [12],
        product_extras: []
      }
    ]
  },
  {
    id: 'cat_tapas_cold',
    name: 'Tapas Frías',
    slug: 'frias',
    icon: 'Utensils',
    products: [
      {
        id: 'p_f1',
        name: 'Jamón 100% Bellota',
        description: 'Corte a cuchillo acompañado de pan de cristal.',
        price: 26.00,
        image_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [1],
        product_extras: [
          { id: 'ex_pan', name: 'Extra Pan de Cristal', price: 2.50 }
        ]
      },
      {
        id: 'p_f2',
        name: 'Ensaladilla Rusa Garum',
        description: 'Con ventresca de atún y regañás artesanales.',
        price: 11.50,
        image_url: 'https://images.unsplash.com/photo-1619051805355-9336b1fca51f?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [3, 4],
        product_extras: []
      }
    ]
  },
  {
    id: 'cat_tapas_hot',
    name: 'Tapas Calientes',
    slug: 'calientes',
    icon: 'Zap',
    products: [
      {
        id: 'p_c1',
        name: 'Pulpo a la Brasa',
        description: 'Con puré de patata trufado y aceite de pimentón.',
        price: 21.00,
        image_url: 'https://images.unsplash.com/photo-1544124499-13e648604771?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [14],
        product_extras: []
      },
      {
        id: 'p_c2',
        name: 'Bao de Carrillera',
        description: 'Dos unidades con cebolla encurtida y mayo sapa.',
        price: 13.00,
        image_url: 'https://images.unsplash.com/photo-1534422298391-e4f8c170db76?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [1, 7],
        product_extras: [
          { id: 'ex_bao', name: 'Unidad Extra', price: 6.00 }
        ]
      }
    ]
  },
  {
    id: 'cat_desserts',
    name: 'Postres',
    slug: 'postres',
    icon: 'CakeSlice',
    products: [
      {
        id: 'p_p1',
        name: 'Tarta de Queso Fundente',
        description: 'Centro cremoso, estilo San Sebastián.',
        price: 8.00,
        image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [3, 7, 8],
        product_extras: []
      }
    ]
  },
  {
    id: 'cat_barista',
    name: 'Barista',
    slug: 'barista',
    icon: 'Coffee',
    products: [
      {
        id: 'p_ba1',
        name: 'Flat White',
        description: 'Café de especialidad con leche perfectamente vaporizada.',
        price: 3.80,
        image_url: 'https://images.unsplash.com/photo-1551033509-32860b73c4da?q=80&w=800&auto=format&fit=crop',
        allergen_ids: [7],
        product_extras: [
          { id: 'ex_oat', name: 'Leche de Avena', price: 0.50 }
        ]
      }
    ]
  }
];
