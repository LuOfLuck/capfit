const StoreManager = require('../src/store-manager');
const FirebaseDb = require('../src/firebase-db');

async function run() {
  console.log('🚀 Iniciando actualización completa de datos para las tiendas...');
  await StoreManager.ensureInitialized();

  // TIENDAS A ACTUALIZAR (EXCLUYENDO 'principal')
  const storeUpdates = [
    {
      id: 'ila',
      data: {
        name: 'ILA Studio',
        tagline: 'Diseño nórdico minimalista y accesorios urbanos de autor',
        plan: 'Pro',
        brandColor: '#1e293b',
        aiMonthlyLimit: 250,
        aiGenerationsUsed: 14,
        active: true,
        about: {
          brandName: 'ILA Studio',
          tagline: 'Diseño nórdico minimalista y accesorios urbanos de autor',
          story: 'ILA nació en 2023 con la visión de concebir accesorios de líneas depuradas, colores sobrios y calce ergonómico superior. Inspirados en la arquitectura moderna y la funcionalidad escandinava, cada gorra es una declaración de sencillez y sofisticación.',
          mission: 'Crear piezas esenciales que combinen estética minimalista, materiales nobles y tecnología de calce para el día a día.',
          vision: 'Ser el referente contemporáneo en accesorios de diseño limpio y moda de autor en toda América Latina.',
          quality: 'Sarga de algodón peinado 100% orgánico, refuerzos invisibles indeformables y herrajes de aluminio satinado mate.',
          foundedYear: '2023',
          location: 'Palermo Soho, Buenos Aires',
          email: 'hola@ila.capfit.shop',
          phone: '+54 9 11 4402-8819',
          statsHappyClients: '+1.850',
          statsTryonAccuracy: '99.4%',
          statsFastShipping: '24 hs'
        }
      },
      products: [
        {
          id: 'ila-mono-minimal',
          storeId: 'ila',
          nombre: 'ILA Mono Minimal',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'ILA Studio',
          coleccion: 'Nordic Essentials',
          precio: 27900,
          precioAnterior: 32900,
          stock: 14,
          badge: 'Nuevo',
          rating: 4.9,
          reviews: 28,
          imgPreview: 'assets/gorras/Gorra_negra_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_negra_frente.webp',
          colores: [
            { name: 'Negro Mate', hex: '#1e293b' },
            { name: 'Gris Grafito', hex: '#334155' }
          ],
          detalles: ['Sarga de algodón peinado 100%', 'Bordado tonal invisible', 'Hebilla metálica satinada', 'Ajuste milimétrico'],
          descripcion: 'Gorra minimalista confeccionada en sarga de algodón peinado con bordado tonal de alta definición.'
        },
        {
          id: 'ila-sand-cap',
          storeId: 'ila',
          nombre: 'ILA Sand Cap',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'ILA Studio',
          coleccion: 'Nordic Essentials',
          precio: 26500,
          precioAnterior: null,
          stock: 11,
          badge: 'Destacado',
          rating: 4.8,
          reviews: 35,
          imgPreview: 'assets/gorras/Agila_frente.webp',
          imgFrontal: 'assets/gorras/Agila_frente.webp',
          colores: [
            { name: 'Arena Nórdica', hex: '#d4c5b9' },
            { name: 'Crema', hex: '#f8fafc' }
          ],
          detalles: ['Algodón orgánico sin tinturas agresivas', 'Visera curva con memoria', 'Banda interior antitranspirante', 'Broche premium'],
          descripcion: 'Tono arena cálido y elegante para combinar con cualquier outfit urbano o relajado.'
        },
        {
          id: 'ila-nordic-navy',
          storeId: 'ila',
          nombre: 'ILA Nordic Navy',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'ILA Studio',
          coleccion: 'Nordic Essentials',
          precio: 28000,
          precioAnterior: 33000,
          stock: 8,
          badge: 'Oferta',
          rating: 5.0,
          reviews: 42,
          imgPreview: 'assets/gorras/Gorra_azul_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_azul_frente.webp',
          colores: [
            { name: 'Azul Profundo', hex: '#0f172a' },
            { name: 'Azul Acero', hex: '#1e3a8a' }
          ],
          detalles: ['Gabardina prelavada de 280g', 'Ojales bordados de ventilación', 'Diseño unisex universal', 'Garantía de confección 6 meses'],
          descripcion: 'Gorra azul profundo con perfil estructurado que mantiene su forma en todo momento.'
        },
        {
          id: 'ila-pure-white',
          storeId: 'ila',
          nombre: 'ILA Pure White',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'ILA Studio',
          coleccion: 'Studio Limited',
          precio: 25900,
          precioAnterior: null,
          stock: 9,
          badge: 'Edición Limitada',
          rating: 4.7,
          reviews: 19,
          imgPreview: 'assets/gorras/blanca_frente.png',
          imgFrontal: 'assets/gorras/blanca_frente.png',
          colores: [
            { name: 'Blanco Puro', hex: '#ffffff' },
            { name: 'Hueso', hex: '#f1f5f9' }
          ],
          detalles: ['Tejido respirable repelente al polvo', 'Cierre strapback en cuero vegano', 'Visera rígida curva', 'Detalles con costura francesa'],
          descripcion: 'Una pieza clásica e impoluta para destacar con sofisticación discreta.'
        },
        {
          id: 'ila-shade-aviator',
          storeId: 'ila',
          nombre: 'ILA Nordic Shades',
          tipo: 'anteojo',
          categoria: 'anteojo',
          marca: 'ILA Studio',
          coleccion: 'Optical Studio',
          precio: 22500,
          precioAnterior: 26000,
          stock: 6,
          badge: 'Nuevo',
          rating: 4.8,
          reviews: 14,
          imgPreview: 'assets/anteojos/ant_arg.png',
          imgFrontal: 'assets/anteojos/ant_arg.png',
          colores: [
            { name: 'Plata Mate', hex: '#94a3b8' },
            { name: 'Negro Carbón', hex: '#0f172a' }
          ],
          detalles: ['Protección UV400 completa', 'Armazón metálico ultraliviano de 18g', 'Cristales polarizados antirreflejo', 'Funda rígida nórdica'],
          descripcion: 'Anteojos de sol con marco geométrico fino de inspiración escandinava y cristales de alta definición.'
        }
      ]
    },

    {
      id: 'prendakxp',
      data: {
        name: 'Prenda KXP',
        tagline: 'Streetwear, trap culture y gorras urbanas de alta densidad',
        plan: 'Pro',
        brandColor: '#dc2626',
        aiMonthlyLimit: 300,
        aiGenerationsUsed: 42,
        active: true,
        about: {
          brandName: 'Prenda KXP',
          tagline: 'Streetwear, trap culture y gorras urbanas de alta densidad',
          story: 'Nacidos al calor de las plazas de freestyle, el skate y los estudios de grabación de trap, Prenda KXP produce gorras y accesorios diseñados para destacar en el escenario y en la calle con bordados 3D imponentes y siluetas agresivas.',
          mission: 'Dar poder de identidad y autenticidad a la escena urbana y a la juventud a través de prendas resistentes con diseño disruptivo.',
          vision: 'Llevar la cultura callejera argentina a los festivales internacionales de música urbana y streetwear mundial.',
          quality: 'Tejidos ripstop de uso rudo, paneles frontales de alta densidad y bordados tridimensionales con hilos reflectivos y dorados.',
          foundedYear: '2024',
          location: 'Córdoba Capital, Argentina',
          email: 'contacto@prendakxp.capfit.shop',
          phone: '+54 9 351 688-9120',
          statsHappyClients: '+2.700',
          statsTryonAccuracy: '99.1%',
          statsFastShipping: '24-48 hs'
        }
      },
      products: [
        {
          id: 'kxp-trap-king',
          storeId: 'prendakxp',
          nombre: 'KXP Trap King Snapback',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Prenda KXP',
          coleccion: 'Trap & Flow',
          precio: 31900,
          precioAnterior: 37000,
          stock: 12,
          badge: 'Best Seller',
          rating: 5.0,
          reviews: 87,
          imgPreview: 'assets/gorras/messi_dorada_frente.webp',
          imgFrontal: 'assets/gorras/messi_dorada_frente.webp',
          colores: [
            { name: 'Negro & Oro', hex: '#111111' },
            { name: 'Oro Puro', hex: '#d4af37' }
          ],
          detalles: ['Bordado 3D de alta densidad en hilo metálico oro', 'Corona alta estructurada de 6 paneles', 'Visera plana con parte inferior verde retro', 'Snapback ajustable de 7 puntos'],
          descripcion: 'El buque insignia de Prenda KXP. La gorra predilecta de la escena trap y freestyle.'
        },
        {
          id: 'kxp-street-rebel',
          storeId: 'prendakxp',
          nombre: 'KXP Street Rebel 99',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Prenda KXP',
          coleccion: 'Underground',
          precio: 28900,
          precioAnterior: null,
          stock: 15,
          badge: 'Nuevo',
          rating: 4.9,
          reviews: 44,
          imgPreview: 'assets/gorras/julian_frente.webp',
          imgFrontal: 'assets/gorras/julian_frente.webp',
          colores: [
            { name: 'Azul Eléctrico', hex: '#1e3a8a' },
            { name: 'Negro Rojo', hex: '#dc2626' }
          ],
          detalles: ['Tejido ripstop antidesgarro', 'Parche termosellado con relieve', 'Visera curva preformada', 'Resistente a la lluvia'],
          descripcion: 'Diseñada para resistir sesiones intensas de skate y movimiento urbano ininterrumpido.'
        },
        {
          id: 'kxp-shadow-black',
          storeId: 'prendakxp',
          nombre: 'KXP Shadow Blackout',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Prenda KXP',
          coleccion: 'Nocturnal Series',
          precio: 29500,
          precioAnterior: 34000,
          stock: 10,
          badge: 'Oferta',
          rating: 4.8,
          reviews: 52,
          imgPreview: 'assets/gorras/Gorra_negra_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_negra_frente.webp',
          colores: [
            { name: 'Negro Carbón', hex: '#000000' },
            { name: 'Rojo KXP', hex: '#b91c1c' }
          ],
          detalles: ['Algodón peinado pesado 320g', 'Etiqueta de tela tejida KXP Originals', 'Cierre metálico grabado', 'Corona reforzada'],
          descripcion: 'Un clásico del street culture con presencia imponente y durabilidad extrema.'
        },
        {
          id: 'kxp-white-cypher',
          storeId: 'prendakxp',
          nombre: 'KXP Cypher White Snap',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Prenda KXP',
          coleccion: 'Trap & Flow',
          precio: 27900,
          precioAnterior: null,
          stock: 8,
          badge: 'Drop Exclusivo',
          rating: 4.9,
          reviews: 31,
          imgPreview: 'assets/gorras/blanca_frente.png',
          imgFrontal: 'assets/gorras/blanca_frente.png',
          colores: [
            { name: 'Blanco Nieve', hex: '#ffffff' },
            { name: 'Gris Humo', hex: '#64748b' }
          ],
          detalles: ['Corona blanca con visera plana contrastante', 'Bordado frontal KXP Cypher', 'Ojales de ventilación reforzados', 'Edición numerada'],
          descripcion: 'Edición limitada pensada para shows, festivales y videoclips de música urbana.'
        },
        {
          id: 'kxp-viper-glasses',
          storeId: 'prendakxp',
          nombre: 'KXP Viper Trap Shades',
          tipo: 'anteojo',
          categoria: 'anteojo',
          marca: 'Prenda KXP',
          coleccion: 'Underground Optics',
          precio: 21900,
          precioAnterior: 25000,
          stock: 14,
          badge: 'Nuevo',
          rating: 4.7,
          reviews: 29,
          imgPreview: 'assets/anteojos/band.webp',
          imgFrontal: 'assets/anteojos/band.webp',
          colores: [
            { name: 'Negro Profundo', hex: '#0f172a' },
            { name: 'Rojo Fuego', hex: '#ef4444' }
          ],
          detalles: ['Cristales espejados con filtro UV400', 'Marco de policarbonato indeformable', 'Patillas flexibles con logo KXP grabado', 'Incluye funda de microfibra'],
          descripcion: 'Lentes urbanos envolventes que completan el outfit de escenario con actitud.'
        }
      ]
    },

    {
      id: 'shops',
      data: {
        name: 'AllShops Multimarca',
        tagline: 'Curaduría multimarca de gorras nacionales, importadas y coleccionables',
        plan: 'Enterprise',
        brandColor: '#2563eb',
        aiMonthlyLimit: 500,
        aiGenerationsUsed: 68,
        active: true,
        about: {
          brandName: 'AllShops Multimarca',
          tagline: 'Curaduría multimarca de gorras nacionales, importadas y coleccionables',
          story: 'AllShops reúne en una única plataforma las marcas más prestigiosas de gorras deportivas, urbanas y de edición limitada. Con probador virtual asistido por IA, garantizamos que elijas exactamente el modelo que mejor calza con tu rostro.',
          mission: 'Democratizar el acceso a ediciones exclusivas de gorras y accesorios con garantía de autenticidad y entrega garantizada.',
          vision: 'Ser la plataforma e-commerce multimarca de referencia en el rubro headwear en todo el Cono Sur.',
          quality: 'Curaduría rigurosa, verificación de originalidad pieza por pieza y despacho en cajas de cartón corrugado rígido termoformado.',
          foundedYear: '2022',
          location: 'Rosario, Santa Fe',
          email: 'ventas@shops.capfit.shop',
          phone: '+54 9 341 512-3344',
          statsHappyClients: '+5.400',
          statsTryonAccuracy: '99.6%',
          statsFastShipping: '24-48 hs'
        }
      },
      products: [
        {
          id: 'allshops-navy-pro',
          storeId: 'shops',
          nombre: 'AllShops Classic Navy',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'AllShops Curated',
          coleccion: 'Multimarca Originals',
          precio: 28500,
          precioAnterior: 33000,
          stock: 18,
          badge: 'Top Ventas',
          rating: 4.9,
          reviews: 94,
          imgPreview: 'assets/gorras/Gorra_azul_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_azul_frente.webp',
          colores: [
            { name: 'Azul Marino Clásico', hex: '#1e3a8a' },
            { name: 'Gris Melange', hex: '#6b7280' }
          ],
          detalles: ['Gabardina peinada pesada', 'Bordado frontal en relieve', 'Cierre regulable metálico', 'Importada oficial'],
          descripcion: 'La gorra azul marino más vendida de la selección multimarca de AllShops.'
        },
        {
          id: 'allshops-gold-crown',
          storeId: 'shops',
          nombre: 'AllShops Gold Crown',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'AllShops Curated',
          coleccion: 'Edición Limitada',
          precio: 34000,
          precioAnterior: 39500,
          stock: 7,
          badge: 'Exclusivo',
          rating: 5.0,
          reviews: 62,
          imgPreview: 'assets/gorras/messi_dorada_frente.webp',
          imgFrontal: 'assets/gorras/messi_dorada_frente.webp',
          colores: [
            { name: 'Negro & Dorado', hex: '#0f172a' },
            { name: 'Oro', hex: '#eab308' }
          ],
          detalles: ['Bordado con hilos metálicos importados', 'Estructura rígida indeformable', 'Incluye caja rígida de coleccionista', 'Certificado de autenticidad'],
          descripcion: 'Pieza de edición especial coleccionable con detalles dorados de máxima distinción.'
        },
        {
          id: 'allshops-urban-sand',
          storeId: 'shops',
          nombre: 'AllShops Urban Sand',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'AllShops Curated',
          coleccion: 'Casual Series',
          precio: 25000,
          precioAnterior: null,
          stock: 14,
          badge: 'Nuevo',
          rating: 4.8,
          reviews: 39,
          imgPreview: 'assets/gorras/Agila_frente.webp',
          imgFrontal: 'assets/gorras/Agila_frente.webp',
          colores: [
            { name: 'Arena Tostada', hex: '#b59a7a' },
            { name: 'Marfil', hex: '#fdfbf7' }
          ],
          detalles: ['Algodón lavado al esmeril súper suave', 'Visera pre-curvada anatómica', 'Ajuste con hebilla vintage', 'Unisex'],
          descripcion: 'Gorra desestructurada de calce bajo que se adapta naturalmente a la forma de la cabeza.'
        },
        {
          id: 'allshops-pure-white',
          storeId: 'shops',
          nombre: 'AllShops Pure White',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'AllShops Curated',
          coleccion: 'Sport Heritage',
          precio: 26500,
          precioAnterior: null,
          stock: 12,
          badge: 'Oferta',
          rating: 4.7,
          reviews: 47,
          imgPreview: 'assets/gorras/blanca_frente.png',
          imgFrontal: 'assets/gorras/blanca_frente.png',
          colores: [
            { name: 'Blanco Óptico', hex: '#ffffff' },
            { name: 'Negro', hex: '#111111' }
          ],
          detalles: ['Textil tecnológico respirable', 'Banda interior dry-fit', 'Cierre strapback resistente', 'Tratamiento antimanchas'],
          descripcion: 'Diseño deportivo clásico ideal para actividades al aire libre y días soleados.'
        },
        {
          id: 'allshops-polarized-optics',
          storeId: 'shops',
          nombre: 'AllShops Polarized Aviator',
          tipo: 'anteojo',
          categoria: 'anteojo',
          marca: 'AllShops Curated',
          coleccion: 'Eyewear Collection',
          precio: 23000,
          precioAnterior: 27500,
          stock: 10,
          badge: 'Destacado',
          rating: 4.8,
          reviews: 58,
          imgPreview: 'assets/anteojos/ant_arg.png',
          imgFrontal: 'assets/anteojos/ant_arg.png',
          colores: [
            { name: 'Plata Espejado', hex: '#cbd5e1' },
            { name: 'Grafito', hex: '#1e293b' }
          ],
          detalles: ['Filtro UV400 categoría 3 certificado', 'Marco ultraliviano de aleación aeroespacial', 'Almohadillas nasales de silicona hipoalergénica', 'Garantía 1 año'],
          descripcion: 'Lentes polarizados de corte aviador con tratamiento antirreflejo y máxima protección.'
        }
      ]
    },

    {
      id: 'tienda1',
      data: {
        name: 'StreetWear Caps',
        tagline: 'Colecciones urbanas independientes y gorras de autor',
        plan: 'Pro',
        brandColor: '#0f172a',
        aiMonthlyLimit: 300,
        aiGenerationsUsed: 26,
        active: true,
        about: {
          brandName: 'StreetWear Caps',
          tagline: 'Colecciones urbanas independientes y gorras de autor',
          story: 'Fundada por diseñadores y skaters en San Isidro, StreetWear Caps nació de la pasión por los detalles: costuras contrastantes, cierres de hebilla de latón gastado y telas de algodón de alto gramaje para crear piezas duraderas con carácter propio.',
          mission: 'Confeccionar accesorios urbanos con espíritu de taller artesanal, fusionando comodidad diaria y estilo contemporáneo.',
          vision: 'Consolidar una red de tiendas urbanas independientes impulsadas por tecnología digital interactiva.',
          quality: 'Telas 100% algodón preencogido, viseras termoformadas indeformables y bordados de alta densidad resistentes al sol.',
          foundedYear: '2023',
          location: 'San Isidro, Buenos Aires',
          email: 'info@streetwearcaps.shop',
          phone: '+54 9 11 6291-7733',
          statsHappyClients: '+3.100',
          statsTryonAccuracy: '99.2%',
          statsFastShipping: '24-48 hs'
        }
      },
      products: [
        {
          id: 'street-stealth-black',
          storeId: 'tienda1',
          nombre: 'Street Stealth Black',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'StreetWear Caps',
          coleccion: 'Urban Series',
          precio: 26900,
          precioAnterior: 31000,
          stock: 15,
          badge: 'Nuevo',
          rating: 4.9,
          reviews: 38,
          imgPreview: 'assets/gorras/Gorra_negra_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_negra_frente.webp',
          colores: [
            { name: 'Negro Mate', hex: '#111111' },
            { name: 'Gris Oscuro', hex: '#374151' }
          ],
          detalles: ['Algodón de 290g peinado', 'Logo bordado de autor en relieve', 'Cierre regulable de bronce gastado', 'Corona estructurada'],
          descripcion: 'La gorra insignia de la firma independiente StreetWear Caps.'
        },
        {
          id: 'street-navy-district',
          storeId: 'tienda1',
          nombre: 'Street Navy District',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'StreetWear Caps',
          coleccion: 'Urban Series',
          precio: 27500,
          precioAnterior: null,
          stock: 12,
          badge: 'Oferta',
          rating: 4.8,
          reviews: 55,
          imgPreview: 'assets/gorras/Gorra_azul_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_azul_frente.webp',
          colores: [
            { name: 'Azul Marino', hex: '#1e3a8a' },
            { name: 'Azul Noche', hex: '#0f172a' }
          ],
          detalles: ['Gabardina resistente antirozaduras', 'Costuras al tono', 'Visera curva anatómica', 'Etiqueta cosida a mano'],
          descripcion: 'Tono azul marino intenso ideal para el trajín diario en la ciudad.'
        },
        {
          id: 'street-sand-artisan',
          storeId: 'tienda1',
          nombre: 'Street Sand Artisan',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'StreetWear Caps',
          coleccion: 'Artisan Workshop',
          precio: 25900,
          precioAnterior: 29000,
          stock: 9,
          badge: 'Edición Limitada',
          rating: 5.0,
          reviews: 29,
          imgPreview: 'assets/gorras/Agila_frente.webp',
          imgFrontal: 'assets/gorras/Agila_frente.webp',
          colores: [
            { name: 'Arena Gastada', hex: '#c5a880' },
            { name: 'Marrón Cuero', hex: '#78350f' }
          ],
          detalles: ['Algodón orgánico lavado a la piedra', 'Hebilla de bronce macizo', 'Cinta interna absorbente', 'Calce relajado'],
          descripcion: 'Estética artesanal de taller con lavado a la piedra y calce relajado.'
        },
        {
          id: 'street-white-block',
          storeId: 'tienda1',
          nombre: 'Street White Block',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'StreetWear Caps',
          coleccion: 'Minimal Lines',
          precio: 24900,
          precioAnterior: null,
          stock: 10,
          badge: 'Destacado',
          rating: 4.7,
          reviews: 32,
          imgPreview: 'assets/gorras/blanca_frente.png',
          imgFrontal: 'assets/gorras/blanca_frente.png',
          colores: [
            { name: 'Blanco Puro', hex: '#f8fafc' },
            { name: 'Negro', hex: '#000000' }
          ],
          detalles: ['Tejido respirable premium', 'Ojales de ventilación bordados', 'Visera con memoria de curvatura', 'Unisex'],
          descripcion: 'Líneas limpias y presencia moderna para looks minimalistas.'
        },
        {
          id: 'street-polarized-optics',
          storeId: 'tienda1',
          nombre: 'Street Aviador Dark',
          tipo: 'anteojo',
          categoria: 'anteojo',
          marca: 'StreetWear Caps',
          coleccion: 'Urban Eyewear',
          precio: 21900,
          precioAnterior: 25500,
          stock: 8,
          badge: 'Nuevo',
          rating: 4.8,
          reviews: 23,
          imgPreview: 'assets/anteojos/ant_arg.png',
          imgFrontal: 'assets/anteojos/ant_arg.png',
          colores: [
            { name: 'Plata / Negro', hex: '#475569' },
            { name: 'Celeste Suave', hex: '#7dd3fc' }
          ],
          detalles: ['Filtro solar UV400 polarizado', 'Marco de metal ultra liviano', 'Almohadillas anatómicas', 'Funda de ecocuero incluida'],
          descripcion: 'Lentes polarizados de corte urbano que completan el estilo StreetWear Caps.'
        }
      ]
    },

    {
      id: 'tienda2',
      data: {
        name: 'Vintage Headwear',
        tagline: 'Gorras retro, truckers clásicas y modelos vintage restaurados',
        plan: 'Enterprise',
        brandColor: '#78350f',
        aiMonthlyLimit: 350,
        aiGenerationsUsed: 48,
        active: true,
        about: {
          brandName: 'Vintage Headwear',
          tagline: 'Gorras retro, truckers clásicas y modelos vintage restaurados',
          story: 'Inspirados en la época dorada del automovilismo de los 70 y la cultura beisbolera de los 80, Vintage Headwear revive los cortes clásicos: paneles de espuma suave, mallas trucker transpirables y parches bordados retro de alta nostalgia.',
          mission: 'Recuperar el valor emocional del diseño clásico a través de una manufactura moderna, sustentable y duradera.',
          vision: 'Ser la marca predilecta de coleccionistas, músicos y amantes de la estética retro en todo el país.',
          quality: 'Mallas de poliéster de alto flujo de aire, frentes de espuma viscoelástica y broches snapback originales de 7 puntos.',
          foundedYear: '2021',
          location: 'Mendoza Capital, Argentina',
          email: 'hola@vintageheadwear.shop',
          phone: '+54 9 261 498-2211',
          statsHappyClients: '+4.600',
          statsTryonAccuracy: '99.5%',
          statsFastShipping: '48 hs'
        }
      },
      products: [
        {
          id: 'vintage-trucker-classic',
          storeId: 'tienda2',
          nombre: 'Vintage Trucker Classic 78',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Vintage Headwear',
          coleccion: 'Route 66 Heritage',
          precio: 28900,
          precioAnterior: 34000,
          stock: 14,
          badge: 'Icono Retro',
          rating: 5.0,
          reviews: 112,
          imgPreview: 'assets/gorras/Gorra_azul_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_azul_frente.webp',
          colores: [
            { name: 'Azul Retro & Blanco', hex: '#1e3a8a' },
            { name: 'Rojo Vintage', hex: '#991b1b' }
          ],
          detalles: ['Frente de espuma indeformable con memoria', 'Malla trasera americana de alta ventilación', 'Snapback plástico de 7 puntos clásico', 'Parche bordado en telar'],
          descripcion: 'El auténtico estilo camionero de los 70 rediseñado con materiales de última generación.'
        },
        {
          id: 'vintage-gold-trophy',
          storeId: 'tienda2',
          nombre: 'Vintage Gold Trophy',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Vintage Headwear',
          coleccion: 'Grand Prix Heritage',
          precio: 33500,
          precioAnterior: 38000,
          stock: 8,
          badge: 'Edición Coleccionista',
          rating: 4.9,
          reviews: 76,
          imgPreview: 'assets/gorras/messi_dorada_frente.webp',
          imgFrontal: 'assets/gorras/messi_dorada_frente.webp',
          colores: [
            { name: 'Negro & Oro Viejo', hex: '#1c1917' },
            { name: 'Oro Champán', hex: '#d97706' }
          ],
          detalles: ['Bordado con laureles en hilo dorado vintage', 'Visera rígida con costuras reforzadas 8 hilos', 'Banda interior de algodón acolchada', 'Caja de madera conmemorativa opcional'],
          descripcion: 'Inspirada en los trofeos y laureles de los campeonatos mundiales clásicos.'
        },
        {
          id: 'vintage-corduroy-sand',
          storeId: 'tienda2',
          nombre: 'Vintage Sand Baseball 82',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Vintage Headwear',
          coleccion: 'Old School League',
          precio: 27900,
          precioAnterior: null,
          stock: 11,
          badge: 'Nuevo',
          rating: 4.8,
          reviews: 43,
          imgPreview: 'assets/gorras/Agila_frente.webp',
          imgFrontal: 'assets/gorras/Agila_frente.webp',
          colores: [
            { name: 'Arena Vintage', hex: '#a88d67' },
            { name: 'Tabaco', hex: '#573a1c' }
          ],
          detalles: ['Sarga gruesa de estilo béisbol años 80', 'Cierre de correa de cuero con hebilla metálica', 'Bordado frontal retro gastado', 'Visera curva anatómica'],
          descripcion: 'Silueta clásica de las ligas tradicionales con terminaciones de alta calidad.'
        },
        {
          id: 'vintage-blackout-retro',
          storeId: 'tienda2',
          nombre: 'Vintage Blackout Rebel',
          tipo: 'gorra',
          categoria: 'gorra',
          marca: 'Vintage Headwear',
          coleccion: 'Cafe Racer Series',
          precio: 29900,
          precioAnterior: 35000,
          stock: 9,
          badge: 'Oferta',
          rating: 4.9,
          reviews: 64,
          imgPreview: 'assets/gorras/Gorra_negra_frente.webp',
          imgFrontal: 'assets/gorras/Gorra_negra_frente.webp',
          colores: [
            { name: 'Negro Envejecido', hex: '#18181b' },
            { name: 'Gris Asfalto', hex: '#52525b' }
          ],
          detalles: ['Algodón pre-lavado con efecto desgastado natural', 'Bordado vintage con relieve', 'Corona de perfil medio', 'Unisex'],
          descripcion: 'Inspirada en el espíritu rebelde de las motocicletas cafe racer de época.'
        },
        {
          id: 'vintage-optics-band',
          storeId: 'tienda2',
          nombre: 'Vintage Sunset Polarized',
          tipo: 'anteojo',
          categoria: 'anteojo',
          marca: 'Vintage Headwear',
          coleccion: 'Retro Eyewear 70s',
          precio: 24500,
          precioAnterior: 29000,
          stock: 12,
          badge: 'Destacado',
          rating: 4.8,
          reviews: 49,
          imgPreview: 'assets/anteojos/band.webp',
          imgFrontal: 'assets/anteojos/band.webp',
          colores: [
            { name: 'Carey Retro', hex: '#78350f' },
            { name: 'Negro Clásico', hex: '#0f172a' }
          ],
          detalles: ['Cristales polarizados de alta claridad óptica', 'Protección UV400 total', 'Patillas con bisagras metálicas reforzadas', 'Estuche rígido símil cuero'],
          descripcion: 'Gafas de sol de estilo retro sesentero con tecnología de lente moderna polarizada.'
        }
      ]
    }
  ];

  for (const item of storeUpdates) {
    console.log(`\n📦 Actualizando tienda "${item.id}" (${item.data.name})...`);
    
    // 1. Actualizar metadata de la tienda
    const updatedStore = StoreManager.updateStore(item.id, item.data);
    console.log(`✅ Metadatos guardados para "${item.id}":`, {
      name: updatedStore.name,
      tagline: updatedStore.tagline,
      plan: updatedStore.plan,
      brandColor: updatedStore.brandColor,
      aiQuota: `${updatedStore.aiGenerationsUsed}/${updatedStore.aiMonthlyLimit}`,
      about: updatedStore.about ? 'Presente (Completo)' : 'Nulo'
    });

    // 2. Actualizar productos
    if (Array.isArray(item.products) && item.products.length > 0) {
      StoreManager.writeStoreProducts(item.id, item.products);
      if (FirebaseDb && typeof FirebaseDb.syncAllStoreProducts === 'function') {
        await FirebaseDb.syncAllStoreProducts(item.id, item.products);
      }
      console.log(`✅ ${item.products.length} productos sincronizados en Firestore para "${item.id}".`);
    }
  }

  // Verificar estado de la principal para confirmar que quedó INTACTA
  const principal = StoreManager.getStoreById('principal');
  const principalProds = StoreManager.readStoreProducts('principal');
  console.log(`\n🔒 Tienda principal CAPFIT verificada (INTACTA):`, {
    id: principal.id,
    name: principal.name,
    tagline: principal.tagline,
    plan: principal.plan,
    productsCount: principalProds.length
  });

  console.log('\n🎉 ¡Todas las tiendas secundarias fueron completadas con éxito!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error actualizando tiendas:', err);
  process.exit(1);
});
