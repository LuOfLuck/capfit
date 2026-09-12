/**
 * CAPFIT - Default Sections Data Provider
 * Provides standard content structures for all store pages.
 */
(function() {
  'use strict';

  function getDefaultSections(store) {
    const currentStore = store || (window.Store ? window.Store.getCurrentStore() : null);
    const storeName = currentStore && currentStore.name ? currentStore.name : 'CAPFIT';
    const storeSubdomain = currentStore && currentStore.subdomain ? currentStore.subdomain : 'capfit';
    const defaultEmail = currentStore && currentStore.ownerEmail ? currentStore.ownerEmail : `contacto@${storeSubdomain}.capfit.shop`;
    const defaultPhone = '+54 9 11 5555-0199';
    const defaultLocation = 'Buenos Aires, Argentina';

    return {
      home: {
        heroTitle: (currentStore && currentStore.heroTitle) || 'Probátela.\nComprá con confianza.',
        heroSubtitle: (currentStore && currentStore.tagline) || 'Usá IA para verte con tus gorras favoritas antes de comprarlas.',
        heroBadge: '🔥 PROBADOR CON IA EN VIVO',
        heroCtaPrimary: 'PROBAR AHORA →',
        heroCtaSecondary: 'Ver catálogo',
        heroProofCount: '+3.500 personas ya probaron',
        heroRatingText: '★★★★★ 4.9 (327 opiniones)',
        announcementActive: true,
        announcementText1: 'Envío gratis en compras mayores a $39.999',
        announcementText2: '30 días para cambios y devoluciones',
        announcementText3: '¿Necesitás ayuda? Escribinos por WhatsApp',
        trust1Title: 'Probá en 3 pasos',
        trust1Desc: 'Elegí, subí tu foto y mirá el resultado.',
        trust2Title: 'Envíos a todo el país',
        trust2Desc: 'Envío gratis en compras mayores a $39.999.',
        trust3Title: '30 días para cambios',
        trust3Desc: 'Si no te convence, lo cambiás sin problema.',
        trust4Title: 'Compra 100% segura',
        trust4Desc: 'Tus datos están protegidos siempre.',
        catalogHeadline: 'Gorras más vendidas'
      },
      about: {
        brandName: storeName,
        tagline: (currentStore && currentStore.tagline) || 'Probadores virtuales de gorras y accesorios con IA. Comprá con confianza, probá primero.',
        story: `En ${storeName} fusionamos diseño de autor, materiales de máxima calidad y tecnología de probador virtual con Inteligencia Artificial. Nacimos para que puedas ver exactamente cómo te queda cada gorra o accesorio en tiempo real antes de recibirlo en tu casa.`,
        mission: `Brindar a cada cliente la seguridad de elegir el producto perfecto antes de comprar, combinando vanguardia tecnológica con la mejor experiencia de compra.`,
        vision: `Ser la marca y plataforma referente en accesorios urbanos con probadores virtuales en Argentina y Latinoamérica.`,
        quality: `Selección rigurosa de tejidos, sarga de algodón de alto gramaje, costuras reforzadas indeformables y herrajes anatómicos.`,
        foundedYear: '2024',
        location: defaultLocation,
        email: defaultEmail,
        phone: defaultPhone,
        statsHappyClients: '+3.500',
        statsTryonAccuracy: '99.2%',
        statsFastShipping: '24-48 hs'
      },
      faq: {
        subtitle: 'Encontrá respuestas rápidas sobre el probador con IA, envíos, medios de pago y garantías de compra.',
        items: [
          {
            id: 'faq-1',
            cat: 'ia',
            q: '¿Cómo funciona el probador virtual con Inteligencia Artificial?',
            a: `En ${storeName} utilizamos visión computacional para calibrar el tamaño, ángulo e iluminación de la prenda en tu rostro. Podés subir una foto o usar tu cámara en vivo y probarte cualquier modelo al instante.`
          },
          {
            id: 'faq-2',
            cat: 'ia',
            q: '¿Mis fotos quedan guardadas o son privadas?',
            a: 'Tu privacidad es total. Tu foto se procesa de forma efímera en la memoria de la sesión y se destruye inmediatamente después. Nunca almacenamos fotos biométricas ni las compartimos con nadie.'
          },
          {
            id: 'faq-3',
            cat: 'envios',
            q: '¿Cuánto tarda en llegar mi pedido y cuánto cuesta el envío?',
            a: 'Para CABA y Gran Buenos Aires las entregas se realizan entre 24 y 48 horas hábiles. Para el resto del país, entre 3 y 5 días hábiles vía Andreani o Correo Argentino. En compras que superen los $40.000, ¡el envío estándar es 100% gratuito!'
          },
          {
            id: 'faq-4',
            cat: 'pagos',
            q: '¿Cuáles son los medios de pago aceptados?',
            a: 'Procesamos todos los pagos a través de Mercado Pago con la máxima seguridad antifraude. Podés pagar con tarjetas de crédito, débito, transferencias y dinero en cuenta.'
          },
          {
            id: 'faq-5',
            cat: 'garantia',
            q: '¿Qué hago si el producto no me queda como esperaba?',
            a: 'Contás con 30 días corridos desde que recibís tu pedido para solicitar un cambio de talle o modelo o la devolución de tu dinero. El primer cambio es sin costo alguno para vos.'
          }
        ]
      },
      envios: {
        freeShippingThreshold: 40000,
        freeShippingBanner: '¡Envío Gratis disponible! En compras superiores a $40.000 a cualquier punto del país.',
        standardTitle: 'Envío Estándar Nacional',
        standardTime: '3 a 5 días hábiles',
        standardCarrier: 'Despachado a través de Andreani o Correo Argentino con seguimiento en tiempo real directo a tu puerta o sucursal más cercana.',
        expressTitle: 'Express CABA y GBA',
        expressTime: '24 a 48 hs hábiles',
        expressDesc: 'Servicio de mensajería prioritario para compras realizadas de Lunes a Viernes antes de las 13:00 hs en el Área Metropolitana.',
        pickupTitle: 'Retiro en Sucursal / Showroom',
        pickupTime: 'Gratis / Inmediato',
        pickupAddress: defaultLocation,
        packagingTitle: 'Embalaje Protector Reforzado',
        packagingDesc: 'Sabemos que una gorra abollada o con la visera doblada arruina la compra. Por eso, cada producto se despacha en cajas rígidas con soporte interno anatómico para que llegue con su horma original intacta.'
      },
      cambios: {
        daysGuarantee: 30,
        bannerTitle: '30 Días Corridos de Garantía Sin Preguntas',
        bannerDesc: 'Tenés hasta 30 días posteriores a la fecha de recepción para solicitar un cambio de producto o la devolución de tu dinero. El primer cambio de talle o modelo no tiene costo de flete.',
        step1Title: 'Contactanos',
        step1Desc: `Escribinos por WhatsApp al ${defaultPhone} o a ${defaultEmail} indicando tu número de pedido y el motivo del cambio.`,
        step2Title: 'Despachá el Paquete',
        step2Desc: 'Te enviamos una etiqueta prepaga para que dejes el paquete en la sucursal de correo más cercana sin abonar nada.',
        step3Title: 'Recibí o Reintegrá',
        step3Desc: 'Una vez verificado el paquete, despachamos el nuevo modelo elegido o te reintegramos el 100% de lo abonado.',
        cond1: 'El producto debe estar nuevo, sin uso, sin perfumes ni marcas de maquillaje.',
        cond2: 'Conservar la etiqueta original colocada y el empaque o caja rígida protectora.',
        cond3: 'Presentar el número de orden o comprobante de compra digital enviado por email.',
        whatsappNumber: defaultPhone
      },
      contacto: {
        whatsapp: defaultPhone,
        whatsappDesc: 'Respuesta rápida (menos de 15 min)',
        email: defaultEmail,
        emailDesc: 'Para cotizaciones mayoristas, pedidos o soporte de compra',
        hoursTitle: 'Horarios de Atención',
        hoursDesc: 'Lunes a Sábados de 9:00 a 20:00 hs',
        locationTitle: 'Punto de Entrega & Showroom',
        locationDesc: defaultLocation,
        headerTitle: 'Contactanos',
        headerSubtitle: 'Estamos disponibles para resolver tus dudas, asesorarte con tu compra o ayudarte con el probador virtual con IA.'
      },
      terminos: {
        lastUpdated: 'Enero 2026',
        art1Title: '1. Aceptación de los Términos',
        art1Body: `Al acceder, navegar o realizar transacciones en ${storeName} y sus servicios asociados, el usuario declara haber leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones.`,
        art2Title: '2. Uso del Probador Virtual con IA',
        art2Body: 'El probador virtual es una herramienta orientativa basada en modelos de Inteligencia Artificial para estimar el calce visual de accesorios. Las imágenes resultantes constituyen representaciones simuladas de alta fidelidad.',
        art3Title: '3. Precios y Moneda',
        art3Body: 'Todos los precios publicados en el catálogo están expresados en pesos argentinos (ARS) e incluyen los impuestos correspondientes.',
        art4Title: '4. Disponibilidad y Despacho',
        art4Body: 'El compromiso de entrega de los productos está sujeto a la disponibilidad de stock físico. En caso de agotarse un artículo, ofreceremos un cambio inmediato o reembolso íntegro.',
        art5Title: '5. Propiedad Intelectual',
        art5Body: `Todos los logotipos, imágenes y diseños son propiedad exclusiva de ${storeName} y se encuentran protegidos por las leyes vigentes.`,
        art6Title: '6. Jurisdicción y Ley Aplicable',
        art6Body: 'Los presentes Términos y Condiciones se rigen por las leyes de la República Argentina.'
      },
      privacidad: {
        art1Title: '1. Privacidad por Diseño en el Probador Virtual',
        art1Body: 'Las fotografías o capturas utilizadas en el Probador IA se procesan de forma efímera en la memoria volátil de la sesión. Nunca almacenamos rasgos faciales ni fotos biométricas en servidores permanentes.',
        art2Title: '2. Datos Recopilados en el Proceso de Compra',
        art2Body: 'Únicamente recopilamos los datos personales estrictamente necesarios para procesar y despachar tu pedido: nombre, dirección, teléfono y correo electrónico.',
        art3Title: '3. Seguridad de Pagos',
        art3Body: 'No almacenamos datos financieros sensibles. Todas las transacciones se canalizan de manera cifrada a través de Mercado Pago con certificación PCI-DSS.',
        art4Title: '4. Derechos del Titular de los Datos',
        art4Body: `De conformidad con la Ley N° 25.326, podés solicitar acceso, rectificación o eliminación de tus datos escribiendo a ${defaultEmail}.`
      }
    };
  }

  window.SectionsData = {
    getDefaultSections
  };
})();
