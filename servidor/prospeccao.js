/* ============================================================
   Prospecção: "encontre quem precisa de você antes de mandar
   mensagem". A versão do MIRA que cabe neste servidor: sem
   Supabase, sem créditos, sem cadastro. Quem usa é quem tem a
   senha do painel; leads e perfil ficam no volume, em JSON.

   Rotas (todas atrás da tranca do /api):
     GET  /api/prospeccao/config              o que está ligado (chaves na stack)
     GET  /api/prospeccao/cidades?pais&q      autocomplete de cidade (Nominatim)
     GET  /api/prospeccao/buscar?…            varredura de negócios
     GET  /api/prospeccao/site?url            diagnóstico rápido do site
     GET  /api/prospeccao/verificar?nome&cidade  procura o site na web (DuckDuckGo, sem chave)
     POST /api/prospeccao/traduzir            português para inglês, sem chave
     POST /api/prospeccao/pontuar             recalcula nota, motivos, perfil do Google e plano
     POST /api/prospeccao/mensagem            mensagem escrita pelo Claude
     GET  /api/prospeccao/instagram?termo&cidade  perfis via Serper
     GET  /api/prospeccao/vagas?termo         vagas remotas de design
     GET/PUT /api/prospeccao/perfil           quem assina as mensagens
     GET/POST /api/prospeccao/leads           minha lista
     PUT/DELETE /api/prospeccao/leads/<id>

   Chaves, todas opcionais, na stack:
     GOOGLE_PLACES_KEY   sem ela a busca cai no OpenStreetMap
                         (Overpass), funciona, mas sem nota nem
                         avaliações
     ANTHROPIC_API_KEY   sem ela só os templates locais escrevem
     SERPER_API_KEY      sem ela a busca de perfis fica desligada
     PAGESPEED_KEY       o navegador chama o PageSpeed direto; a
                         chave só aumenta a cota
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RAIZ_DADOS } from './dados.js';
import { diagnosticar, normalizarUrl } from './prospeccao-site.js';
import { verificarSite, traduzir, ehDiretorio } from './prospeccao-web.js';
import { plano } from './prospeccao-plano.js';

const PASTA = path.join(RAIZ_DADOS, 'prospeccao');
const ARQ_LEADS = path.join(PASTA, 'leads.json');
const ARQ_PERFIL = path.join(PASTA, 'perfil.json');

const UA = 'links.samuelfreire.com.br/google-prospection (prospeccao; contato: samuelfreirebr@gmail.com)';

const chaveGoogle = () => process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const chaveClaude = () => process.env.ANTHROPIC_API_KEY || '';
const chaveSerper = () => process.env.SERPER_API_KEY || '';
const chavePageSpeed = () => process.env.PAGESPEED_KEY || '';

/* ---------- respostas ---------- */

const json = (res, dado, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dado));
};

async function lerCorpoJson(req, limite = 256 * 1024) {
  const pedacos = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) throw new Error('grande');
    pedacos.push(p);
  }
  const bruto = Buffer.concat(pedacos).toString('utf8');
  return bruto ? JSON.parse(bruto) : {};
}

// fetch com prazo: nenhuma fonte externa pode segurar uma requisição pra sempre.
async function buscar(url, opcoes = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opcoes, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

/* ---------- nichos e países ---------- */

/* Cada nicho carrega o termo que vai pro Google (na língua do país),
   o grupo (senão o menu vira uma lista de cem linhas soltas) e a tag
   do OpenStreetMap (para quando não há chave do Google). Quando o
   OpenStreetMap não tem tag pro serviço, vai `osmNome`: palavras
   procuradas no nome do negócio, separadas por barra. */
export const GRUPOS = [
  ['obra', 'Casa, obra e reforma'],
  ['imovel', 'Imóveis'],
  ['auto', 'Carro e moto'],
  ['saude', 'Saúde'],
  ['beleza', 'Beleza e estética'],
  ['fitness', 'Esporte e movimento'],
  ['alimentacao', 'Comida e bebida'],
  ['pet', 'Pets'],
  ['servicos', 'Serviços para empresas'],
  ['educacao', 'Educação'],
  ['eventos', 'Eventos e festas'],
  ['varejo', 'Lojas'],
  ['turismo', 'Hospedagem e viagem'],
];

export const NICHOS = [
  /* ---- casa, obra e reforma: o alvo principal lá fora ---- */
  { id: 'construtora',      g: 'obra', pt: 'Construtora',                 en: 'General contractor',         es: 'Constructora',               osm: ['office', 'construction_company'] },
  { id: 'reforma',          g: 'obra', pt: 'Reforma de casas',            en: 'Home remodeling contractor', es: 'Reformas de viviendas',      osm: ['craft', 'builder'] },
  { id: 'reforma-cozinha',  g: 'obra', pt: 'Reforma de cozinha',          en: 'Kitchen remodeling',         es: 'Reforma de cocinas',         osm: ['shop', 'kitchen'] },
  { id: 'reforma-banheiro', g: 'obra', pt: 'Reforma de banheiro',         en: 'Bathroom remodeling',        es: 'Reforma de baños',           osm: ['shop', 'bathroom_furnishing'] },
  { id: 'telhado',          g: 'obra', pt: 'Telhados',                    en: 'Roofing contractor',         es: 'Tejados',                    osm: ['craft', 'roofer'] },
  { id: 'encanador',        g: 'obra', pt: 'Encanador e hidráulica',      en: 'Plumber',                    es: 'Fontanero',                  osm: ['craft', 'plumber'] },
  { id: 'eletricista',      g: 'obra', pt: 'Eletricista',                 en: 'Electrician',                es: 'Electricista',               osm: ['craft', 'electrician'] },
  { id: 'climatizacao',     g: 'obra', pt: 'Ar-condicionado e aquecimento', en: 'HVAC contractor',          es: 'Climatización',              osm: ['craft', 'hvac'] },
  { id: 'pintor',           g: 'obra', pt: 'Pintura',                     en: 'Painting contractor',        es: 'Pintor',                     osm: ['craft', 'painter'] },
  { id: 'piso',             g: 'obra', pt: 'Colocação de piso',           en: 'Flooring contractor',        es: 'Suelos',                     osm: ['craft', 'floorer'] },
  { id: 'azulejista',       g: 'obra', pt: 'Azulejo e revestimento',      en: 'Tile contractor',            es: 'Alicatador',                 osm: ['craft', 'tiler'] },
  { id: 'carpinteiro',      g: 'obra', pt: 'Carpintaria',                 en: 'Carpenter',                  es: 'Carpintero',                 osm: ['craft', 'carpenter'] },
  { id: 'marcenaria',       g: 'obra', pt: 'Marcenaria e armários',       en: 'Cabinet maker',              es: 'Ebanistería',                osm: ['craft', 'cabinet_maker'] },
  { id: 'janelas',          g: 'obra', pt: 'Janelas',                     en: 'Window installation',        es: 'Ventanas',                   osm: ['craft', 'window_construction'] },
  { id: 'portas',           g: 'obra', pt: 'Portas',                      en: 'Door installation',          es: 'Puertas',                    osm: ['craft', 'door_construction'] },
  { id: 'portao',           g: 'obra', pt: 'Portões e automação',         en: 'Garage door service',        es: 'Puertas de garaje',          osmNome: 'portao/portoes/garage door/porton' },
  { id: 'cerca',            g: 'obra', pt: 'Cercas e muros',              en: 'Fence contractor',           es: 'Vallas y cercas',            osm: ['craft', 'fence_maker'] },
  { id: 'deck',             g: 'obra', pt: 'Deck e pergolado',            en: 'Deck builder',               es: 'Terrazas de madera',         osmNome: 'deck/pergola/pergolado/patio' },
  { id: 'concreto',         g: 'obra', pt: 'Concreto',                    en: 'Concrete contractor',        es: 'Hormigón',                   osmNome: 'concreto/concrete/hormigon' },
  { id: 'alvenaria',        g: 'obra', pt: 'Alvenaria e pedra',           en: 'Masonry contractor',         es: 'Albañilería',                osm: ['craft', 'stonemason'] },
  { id: 'marmoraria',       g: 'obra', pt: 'Mármore e granito',           en: 'Countertop installer',       es: 'Mármoles y granitos',        osmNome: 'marmoraria/granito/marmore/countertop/marble' },
  { id: 'vidracaria',       g: 'obra', pt: 'Vidraçaria',                  en: 'Glass and glazing company',  es: 'Vidriería',                  osm: ['craft', 'glaziery'] },
  { id: 'serralheria',      g: 'obra', pt: 'Serralheria e solda',         en: 'Welding and metal work',     es: 'Herrería',                   osm: ['craft', 'metal_construction'] },
  { id: 'drywall',          g: 'obra', pt: 'Drywall e gesso',             en: 'Drywall contractor',         es: 'Pladur y yeso',              osm: ['craft', 'plasterer'] },
  { id: 'isolamento',       g: 'obra', pt: 'Isolamento térmico',          en: 'Insulation contractor',      es: 'Aislamiento',                osm: ['craft', 'insulation'] },
  { id: 'impermeabilizacao',g: 'obra', pt: 'Impermeabilização',           en: 'Waterproofing contractor',   es: 'Impermeabilización',         osmNome: 'impermeabiliz/waterproof' },
  { id: 'calhas',           g: 'obra', pt: 'Calhas e rufos',              en: 'Gutter installation',        es: 'Canalones',                  osmNome: 'calha/gutter/canalon' },
  { id: 'chamine',          g: 'obra', pt: 'Lareira e chaminé',           en: 'Chimney sweep',              es: 'Deshollinador',              osm: ['craft', 'chimney_sweeper'] },
  { id: 'toldos',           g: 'obra', pt: 'Toldos e persianas',          en: 'Awning and shade company',   es: 'Toldos',                     osm: ['craft', 'sun_protection'] },
  { id: 'solar',            g: 'obra', pt: 'Energia solar',               en: 'Solar panel installer',      es: 'Energía solar',              osmNome: 'solar' },
  { id: 'pavimentacao',     g: 'obra', pt: 'Pavimentação e asfalto',      en: 'Paving contractor',          es: 'Pavimentación',              osm: ['craft', 'paver'] },
  { id: 'terraplanagem',    g: 'obra', pt: 'Terraplanagem e escavação',   en: 'Excavation contractor',      es: 'Excavación',                 osmNome: 'terraplan/escavacao/excavat/movimiento de tierras' },
  { id: 'demolicao',        g: 'obra', pt: 'Demolição',                   en: 'Demolition contractor',      es: 'Demolición',                 osmNome: 'demoli' },
  { id: 'poco',             g: 'obra', pt: 'Poço artesiano',              en: 'Well drilling company',      es: 'Perforación de pozos',       osm: ['craft', 'water_well_drilling'] },
  { id: 'fossa',            g: 'obra', pt: 'Fossa e saneamento',          en: 'Septic tank service',        es: 'Fosas sépticas',             osmNome: 'fossa/septic/saneamento' },
  { id: 'piscina',          g: 'obra', pt: 'Piscinas',                    en: 'Pool builder and service',   es: 'Piscinas',                   osm: ['shop', 'swimming_pool'] },
  { id: 'paisagismo',       g: 'obra', pt: 'Paisagismo',                  en: 'Landscaping company',        es: 'Paisajismo',                 osm: ['craft', 'gardener'] },
  { id: 'jardinagem',       g: 'obra', pt: 'Jardinagem e gramado',        en: 'Lawn care service',          es: 'Jardinería',                 osmNome: 'jardinagem/jardineria/lawn/gramado/landscap' },
  { id: 'arborizacao',      g: 'obra', pt: 'Poda e corte de árvore',      en: 'Tree service',               es: 'Poda de árboles',            osmNome: 'arborista/poda/tree service/tree care' },
  { id: 'irrigacao',        g: 'obra', pt: 'Irrigação',                   en: 'Irrigation contractor',      es: 'Riego',                      osmNome: 'irriga/sprinkler/riego' },
  { id: 'lavagem-fachada',  g: 'obra', pt: 'Lavagem de fachada',          en: 'Pressure washing service',   es: 'Limpieza a presión',         osmNome: 'lava jato/pressure wash/power wash/hidrojato' },
  { id: 'limpeza',          g: 'obra', pt: 'Limpeza e faxina',            en: 'Cleaning service',           es: 'Servicio de limpieza',       osmNome: 'limpeza/faxina/cleaning/maid/limpieza' },
  { id: 'dedetizacao',      g: 'obra', pt: 'Dedetização',                 en: 'Pest control company',       es: 'Control de plagas',          osm: ['craft', 'pest_control'] },
  { id: 'entulho',          g: 'obra', pt: 'Caçamba e entulho',           en: 'Junk removal service',       es: 'Retirada de escombros',      osmNome: 'cacamba/entulho/junk removal/dumpster' },
  { id: 'mudancas',         g: 'obra', pt: 'Mudanças e carreto',          en: 'Moving company',             es: 'Mudanzas',                   osm: ['office', 'moving_company'] },
  { id: 'chaveiro',         g: 'obra', pt: 'Chaveiro',                    en: 'Locksmith',                  es: 'Cerrajero',                  osm: ['craft', 'locksmith'] },
  { id: 'marido-aluguel',   g: 'obra', pt: 'Marido de aluguel',           en: 'Handyman service',           es: 'Manitas',                    osmNome: 'marido de aluguel/handyman/manitas' },
  { id: 'sinistro',         g: 'obra', pt: 'Recuperação de sinistro',     en: 'Water and fire restoration', es: 'Restauración de daños',      osmNome: 'restoration/sinistro/water damage/restaura' },
  { id: 'eletrodomesticos', g: 'obra', pt: 'Conserto de eletrodoméstico', en: 'Appliance repair service',   es: 'Reparación de electrodomésticos', osm: ['shop', 'appliance'] },
  { id: 'seguranca-casa',   g: 'obra', pt: 'Alarme e câmera',             en: 'Security system installer',  es: 'Alarmas y cámaras',          osmNome: 'alarme/camera/seguranca eletronica/security system' },
  { id: 'vistoria',         g: 'obra', pt: 'Vistoria de imóvel',          en: 'Home inspector',             es: 'Inspección de viviendas',    osmNome: 'vistoria/inspecao/home inspection/inspeccion' },
  { id: 'arquitetura',      g: 'obra', pt: 'Arquitetura',                 en: 'Architect',                  es: 'Arquitecto',                 osm: ['office', 'architect'] },
  { id: 'interiores',       g: 'obra', pt: 'Design de interiores',        en: 'Interior designer',          es: 'Diseño de interiores',       osm: ['shop', 'interior_decoration'] },
  { id: 'engenharia',       g: 'obra', pt: 'Engenharia',                  en: 'Engineering firm',           es: 'Ingeniería',                 osm: ['office', 'engineer'] },
  { id: 'material-obra',    g: 'obra', pt: 'Material de construção',      en: 'Building supply store',      es: 'Materiales de construcción', osm: ['shop', 'doityourself'] },
  { id: 'moveis-planejados',g: 'obra', pt: 'Móveis planejados',           en: 'Custom furniture maker',     es: 'Muebles a medida',           osm: ['shop', 'furniture'] },
  { id: 'estofaria',        g: 'obra', pt: 'Estofaria e tapeçaria',       en: 'Upholstery shop',            es: 'Tapicería',                  osm: ['craft', 'upholsterer'] },

  /* ---- imóveis ---- */
  { id: 'imobiliaria',      g: 'imovel', pt: 'Imobiliária',               en: 'Real estate agency',         es: 'Inmobiliaria',               osm: ['office', 'estate_agent'] },
  { id: 'condominio',       g: 'imovel', pt: 'Administradora de condomínio', en: 'Property management company', es: 'Administración de fincas', osm: ['office', 'property_management'] },
  { id: 'temporada',        g: 'imovel', pt: 'Aluguel por temporada',     en: 'Vacation rental manager',    es: 'Alquiler vacacional',        osmNome: 'temporada/vacation rental/aluguel' },

  /* ---- carro e moto ---- */
  { id: 'oficina',          g: 'auto', pt: 'Oficina mecânica',            en: 'Auto repair shop',           es: 'Taller mecánico',            osm: ['shop', 'car_repair'] },
  { id: 'concessionaria',   g: 'auto', pt: 'Concessionária',              en: 'Car dealership',             es: 'Concesionario',              osm: ['shop', 'car'] },
  { id: 'funilaria',        g: 'auto', pt: 'Funilaria e pintura',         en: 'Auto body shop',             es: 'Taller de chapa y pintura',  osm: ['craft', 'car_painter'] },
  { id: 'lava-rapido',      g: 'auto', pt: 'Lava-rápido e estética',      en: 'Car wash and detailing',     es: 'Lavado de coches',           osm: ['amenity', 'car_wash'] },
  { id: 'auto-pecas',       g: 'auto', pt: 'Auto peças',                  en: 'Auto parts store',           es: 'Tienda de repuestos',        osm: ['shop', 'car_parts'] },
  { id: 'pneus',            g: 'auto', pt: 'Pneus e alinhamento',         en: 'Tire shop',                  es: 'Neumáticos',                 osm: ['shop', 'tyres'] },
  { id: 'moto',             g: 'auto', pt: 'Motos',                       en: 'Motorcycle shop',            es: 'Tienda de motos',            osm: ['shop', 'motorcycle'] },
  { id: 'guincho',          g: 'auto', pt: 'Guincho',                     en: 'Towing service',             es: 'Grúa',                       osmNome: 'guincho/towing/grua' },
  { id: 'insulfilm',        g: 'auto', pt: 'Insulfilm e envelopamento',   en: 'Window tint and wrap shop',  es: 'Polarizado y rotulación',    osmNome: 'insulfilm/window tint/envelopamento/polarizado' },
  { id: 'locadora',         g: 'auto', pt: 'Locadora de veículos',        en: 'Car rental',                 es: 'Alquiler de coches',         osm: ['amenity', 'car_rental'] },

  /* ---- saúde ---- */
  { id: 'dentista',         g: 'saude', pt: 'Dentista',                   en: 'Dentist',                    es: 'Dentista',                   osm: ['amenity', 'dentist'] },
  { id: 'clinica',          g: 'saude', pt: 'Clínica médica',             en: 'Medical clinic',             es: 'Clínica médica',             osm: ['amenity', 'clinic'] },
  { id: 'fisioterapia',     g: 'saude', pt: 'Fisioterapia',               en: 'Physical therapy clinic',    es: 'Fisioterapeuta',             osm: ['healthcare', 'physiotherapist'] },
  { id: 'psicologia',       g: 'saude', pt: 'Psicologia',                 en: 'Therapist',                  es: 'Psicólogo',                  osm: ['healthcare', 'psychotherapist'] },
  { id: 'nutricionista',    g: 'saude', pt: 'Nutricionista',              en: 'Nutritionist',               es: 'Nutricionista',              osm: ['healthcare', 'nutrition_counselling'] },
  { id: 'quiropraxia',      g: 'saude', pt: 'Quiropraxia',                en: 'Chiropractor',               es: 'Quiropráctico',              osm: ['healthcare', 'chiropractor'] },
  { id: 'oftalmologia',     g: 'saude', pt: 'Ótica e oftalmologia',       en: 'Optometrist',                es: 'Óptica',                     osm: ['shop', 'optician'] },
  { id: 'dermatologia',     g: 'saude', pt: 'Dermatologia',               en: 'Dermatology clinic',         es: 'Dermatología',               osmNome: 'dermatolog' },
  { id: 'pediatria',        g: 'saude', pt: 'Pediatria',                  en: 'Pediatric clinic',           es: 'Pediatría',                  osmNome: 'pediatr' },
  { id: 'fonoaudiologia',   g: 'saude', pt: 'Fonoaudiologia',             en: 'Speech therapy clinic',      es: 'Logopedia',                  osm: ['healthcare', 'speech_therapist'] },
  { id: 'podologia',        g: 'saude', pt: 'Podologia',                  en: 'Podiatrist',                 es: 'Podología',                  osm: ['healthcare', 'podiatrist'] },
  { id: 'laboratorio',      g: 'saude', pt: 'Laboratório de exames',      en: 'Medical laboratory',         es: 'Laboratorio clínico',        osm: ['healthcare', 'laboratory'] },
  { id: 'farmacia',         g: 'saude', pt: 'Farmácia',                   en: 'Pharmacy',                   es: 'Farmacia',                   osm: ['amenity', 'pharmacy'] },
  { id: 'home-care',        g: 'saude', pt: 'Home care e cuidador',       en: 'Home care agency',           es: 'Cuidado a domicilio',        osmNome: 'home care/cuidador/enfermagem/asistencia domiciliaria' },
  { id: 'acupuntura',       g: 'saude', pt: 'Acupuntura e terapias',      en: 'Acupuncture clinic',         es: 'Acupuntura',                 osm: ['healthcare', 'alternative'] },
  { id: 'veterinaria',      g: 'saude', pt: 'Veterinária',                en: 'Veterinarian',               es: 'Veterinario',                osm: ['amenity', 'veterinary'] },

  /* ---- beleza ---- */
  { id: 'salao',            g: 'beleza', pt: 'Salão de cabelo',           en: 'Hair salon',                 es: 'Peluquería',                 osm: ['shop', 'hairdresser'] },
  { id: 'barbearia',        g: 'beleza', pt: 'Barbearia',                 en: 'Barber shop',                es: 'Barbería',                   osmNome: 'barbearia/barber/barberia' },
  { id: 'estetica',         g: 'beleza', pt: 'Estética e beleza',         en: 'Beauty clinic',              es: 'Clínica de estética',        osm: ['shop', 'beauty'] },
  { id: 'unhas',            g: 'beleza', pt: 'Unhas e manicure',          en: 'Nail salon',                 es: 'Salón de uñas',              osmNome: 'nail/unha/manicure/esmalteria' },
  { id: 'cilios',           g: 'beleza', pt: 'Cílios e sobrancelha',      en: 'Lash and brow studio',       es: 'Pestañas y cejas',           osmNome: 'cilios/sobrancelha/lash/brow/pestanas' },
  { id: 'depilacao',        g: 'beleza', pt: 'Depilação',                 en: 'Waxing studio',              es: 'Depilación',                 osmNome: 'depila/waxing' },
  { id: 'tatuagem',         g: 'beleza', pt: 'Tatuagem e piercing',       en: 'Tattoo studio',              es: 'Estudio de tatuajes',        osm: ['shop', 'tattoo'] },
  { id: 'spa',              g: 'beleza', pt: 'Spa e massagem',            en: 'Spa and massage',            es: 'Spa y masajes',              osm: ['leisure', 'spa'] },

  /* ---- esporte e movimento ---- */
  { id: 'academia',         g: 'fitness', pt: 'Academia',                 en: 'Gym',                        es: 'Gimnasio',                   osm: ['leisure', 'fitness_centre'] },
  { id: 'crossfit',         g: 'fitness', pt: 'Crossfit e funcional',     en: 'Crossfit box',               es: 'Crossfit',                   osmNome: 'crossfit/funcional' },
  { id: 'pilates',          g: 'fitness', pt: 'Pilates',                  en: 'Pilates studio',             es: 'Pilates',                    osmNome: 'pilates' },
  { id: 'yoga',             g: 'fitness', pt: 'Yoga',                     en: 'Yoga studio',                es: 'Yoga',                       osmNome: 'yoga' },
  { id: 'lutas',            g: 'fitness', pt: 'Artes marciais',           en: 'Martial arts school',        es: 'Artes marciales',            osmNome: 'jiu/karate/muay/taekwondo/judo/boxe' },
  { id: 'danca',            g: 'fitness', pt: 'Escola de dança',          en: 'Dance studio',               es: 'Escuela de baile',           osmNome: 'danca/dance/baile' },
  { id: 'personal',         g: 'fitness', pt: 'Personal trainer',         en: 'Personal trainer',           es: 'Entrenador personal',        osmNome: 'personal trainer/treinamento' },

  /* ---- comida e bebida ---- */
  { id: 'restaurante',      g: 'alimentacao', pt: 'Restaurante',          en: 'Restaurant',                 es: 'Restaurante',                osm: ['amenity', 'restaurant'] },
  { id: 'hamburgueria',     g: 'alimentacao', pt: 'Hamburgueria',         en: 'Burger restaurant',          es: 'Hamburguesería',             osm: ['amenity', 'fast_food'] },
  { id: 'pizzaria',         g: 'alimentacao', pt: 'Pizzaria',             en: 'Pizzeria',                   es: 'Pizzería',                   osmNome: 'pizza' },
  { id: 'cafeteria',        g: 'alimentacao', pt: 'Cafeteria',            en: 'Coffee shop',                es: 'Cafetería',                  osm: ['amenity', 'cafe'] },
  { id: 'padaria',          g: 'alimentacao', pt: 'Padaria',              en: 'Bakery',                     es: 'Panadería',                  osm: ['shop', 'bakery'] },
  { id: 'confeitaria',      g: 'alimentacao', pt: 'Confeitaria e doces',  en: 'Cake and dessert shop',      es: 'Pastelería',                 osm: ['shop', 'confectionery'] },
  { id: 'sorveteria',       g: 'alimentacao', pt: 'Sorveteria',           en: 'Ice cream shop',             es: 'Heladería',                  osm: ['amenity', 'ice_cream'] },
  { id: 'bar',              g: 'alimentacao', pt: 'Bar e pub',            en: 'Bar and pub',                es: 'Bar',                        osm: ['amenity', 'bar'] },
  { id: 'cervejaria',       g: 'alimentacao', pt: 'Cervejaria artesanal', en: 'Craft brewery',              es: 'Cervecería artesanal',       osm: ['craft', 'brewery'] },
  { id: 'buffet',           g: 'alimentacao', pt: 'Buffet e catering',    en: 'Catering company',           es: 'Catering',                   osm: ['craft', 'caterer'] },
  { id: 'acougue',          g: 'alimentacao', pt: 'Açougue',              en: 'Butcher shop',               es: 'Carnicería',                 osm: ['shop', 'butcher'] },
  { id: 'hortifruti',       g: 'alimentacao', pt: 'Hortifruti',           en: 'Produce market',             es: 'Frutería',                   osm: ['shop', 'greengrocer'] },
  { id: 'marmitaria',       g: 'alimentacao', pt: 'Marmitaria',           en: 'Meal prep kitchen',          es: 'Comida preparada',           osmNome: 'marmita/meal prep/comida caseira' },

  /* ---- pets ---- */
  { id: 'petshop',          g: 'pet', pt: 'Pet shop',                     en: 'Pet shop',                   es: 'Tienda de mascotas',         osm: ['shop', 'pet'] },
  { id: 'banho-tosa',       g: 'pet', pt: 'Banho e tosa',                 en: 'Pet grooming',               es: 'Peluquería canina',          osm: ['shop', 'pet_grooming'] },
  { id: 'adestrador',       g: 'pet', pt: 'Adestramento',                 en: 'Dog trainer',                es: 'Adiestrador canino',         osmNome: 'adestra/dog train/adiestra' },
  { id: 'hotel-pet',        g: 'pet', pt: 'Hotel e creche para pet',      en: 'Pet boarding and daycare',   es: 'Guardería canina',           osmNome: 'hotel pet/creche pet/pet boarding/pet daycare' },

  /* ---- serviços para empresas ---- */
  { id: 'advocacia',        g: 'servicos', pt: 'Advocacia',               en: 'Law firm',                   es: 'Abogado',                    osm: ['office', 'lawyer'] },
  { id: 'contabilidade',    g: 'servicos', pt: 'Contabilidade',           en: 'Accounting firm',            es: 'Contador',                   osm: ['office', 'accountant'] },
  { id: 'seguros',          g: 'servicos', pt: 'Corretora de seguros',    en: 'Insurance agency',           es: 'Correduría de seguros',      osm: ['office', 'insurance'] },
  { id: 'financeiro',       g: 'servicos', pt: 'Consultoria financeira',  en: 'Financial advisor',          es: 'Asesor financiero',          osm: ['office', 'financial'] },
  { id: 'marketing',        g: 'servicos', pt: 'Agência de marketing',    en: 'Marketing agency',           es: 'Agencia de marketing',       osm: ['office', 'advertising_agency'] },
  { id: 'ti',               g: 'servicos', pt: 'Empresa de TI',           en: 'IT services company',        es: 'Empresa de informática',     osm: ['office', 'it'] },
  { id: 'rh',               g: 'servicos', pt: 'Recrutamento e RH',       en: 'Staffing agency',            es: 'Agencia de empleo',          osm: ['office', 'employment_agency'] },
  { id: 'grafica',          g: 'servicos', pt: 'Gráfica',                 en: 'Print shop',                 es: 'Imprenta',                   osm: ['shop', 'copyshop'] },
  { id: 'comunicacao-visual', g: 'servicos', pt: 'Comunicação visual',    en: 'Sign company',               es: 'Rotulación',                 osm: ['craft', 'signmaker'] },
  { id: 'fotografia',       g: 'servicos', pt: 'Fotografia',              en: 'Photographer',               es: 'Fotógrafo',                  osm: ['craft', 'photographer'] },
  { id: 'coworking',        g: 'servicos', pt: 'Coworking',               en: 'Coworking space',            es: 'Coworking',                  osm: ['office', 'coworking'] },
  { id: 'logistica',        g: 'servicos', pt: 'Transporte e logística',  en: 'Logistics company',          es: 'Logística',                  osm: ['office', 'logistics'] },
  { id: 'seguranca',        g: 'servicos', pt: 'Segurança patrimonial',   en: 'Security guard company',     es: 'Empresa de seguridad',       osmNome: 'seguranca/security/vigilancia' },

  /* ---- educação ---- */
  { id: 'escola',           g: 'educacao', pt: 'Escola particular',       en: 'Private school',             es: 'Colegio privado',            osm: ['amenity', 'school'] },
  { id: 'creche',           g: 'educacao', pt: 'Creche e infantil',       en: 'Daycare and preschool',      es: 'Guardería',                  osm: ['amenity', 'kindergarten'] },
  { id: 'idiomas',          g: 'educacao', pt: 'Escola de idiomas',       en: 'Language school',            es: 'Academia de idiomas',        osm: ['amenity', 'language_school'] },
  { id: 'autoescola',       g: 'educacao', pt: 'Autoescola',              en: 'Driving school',             es: 'Autoescuela',                osm: ['amenity', 'driving_school'] },
  { id: 'musica',           g: 'educacao', pt: 'Escola de música',        en: 'Music school',               es: 'Escuela de música',          osm: ['amenity', 'music_school'] },
  { id: 'reforco',          g: 'educacao', pt: 'Reforço e cursinho',      en: 'Tutoring center',            es: 'Clases particulares',        osmNome: 'reforco/tutoring/cursinho/vestibular' },

  /* ---- eventos ---- */
  { id: 'espaco-eventos',   g: 'eventos', pt: 'Espaço de eventos',        en: 'Event venue',                es: 'Salón de eventos',           osm: ['amenity', 'events_venue'] },
  { id: 'festas',           g: 'eventos', pt: 'Festas e decoração',       en: 'Event planner',              es: 'Organización de eventos',    osmNome: 'festa/eventos/decoracao/event planner' },
  { id: 'casamento',        g: 'eventos', pt: 'Casamento e cerimonial',   en: 'Wedding planner',            es: 'Bodas',                      osmNome: 'casamento/wedding/noiva/boda' },
  { id: 'aluguel-equipamento', g: 'eventos', pt: 'Aluguel de equipamento',en: 'Party equipment rental',     es: 'Alquiler de equipos',        osmNome: 'locacao/rental/alquiler/aluguel' },

  /* ---- lojas ---- */
  { id: 'roupas',           g: 'varejo', pt: 'Loja de roupas',            en: 'Clothing store',             es: 'Tienda de ropa',             osm: ['shop', 'clothes'] },
  { id: 'calcados',         g: 'varejo', pt: 'Calçados',                  en: 'Shoe store',                 es: 'Zapatería',                  osm: ['shop', 'shoes'] },
  { id: 'joalheria',        g: 'varejo', pt: 'Joalheria',                 en: 'Jewelry store',              es: 'Joyería',                    osm: ['shop', 'jewelry'] },
  { id: 'floricultura',     g: 'varejo', pt: 'Floricultura',              en: 'Florist',                    es: 'Floristería',                osm: ['shop', 'florist'] },
  { id: 'papelaria',        g: 'varejo', pt: 'Papelaria',                 en: 'Stationery store',           es: 'Papelería',                  osm: ['shop', 'stationery'] },
  { id: 'celular',          g: 'varejo', pt: 'Celular e assistência',     en: 'Phone repair shop',          es: 'Tienda de móviles',          osm: ['shop', 'mobile_phone'] },
  { id: 'informatica',      g: 'varejo', pt: 'Informática',               en: 'Computer store',             es: 'Tienda de informática',      osm: ['shop', 'computer'] },
  { id: 'bicicleta',        g: 'varejo', pt: 'Bicicletaria',              en: 'Bike shop',                  es: 'Tienda de bicicletas',       osm: ['shop', 'bicycle'] },
  { id: 'esportes',         g: 'varejo', pt: 'Artigos esportivos',        en: 'Sporting goods store',       es: 'Tienda de deportes',         osm: ['shop', 'sports'] },
  { id: 'colchoes',         g: 'varejo', pt: 'Colchões',                  en: 'Mattress store',             es: 'Tienda de colchones',        osm: ['shop', 'bed'] },
  { id: 'decoracao',        g: 'varejo', pt: 'Decoração e utilidades',    en: 'Home decor store',           es: 'Tienda de decoración',       osm: ['shop', 'houseware'] },

  /* ---- hospedagem e viagem ---- */
  { id: 'hotel',            g: 'turismo', pt: 'Hotel',                    en: 'Hotel',                      es: 'Hotel',                      osm: ['tourism', 'hotel'] },
  { id: 'pousada',          g: 'turismo', pt: 'Pousada',                  en: 'Inn and guest house',        es: 'Hostal',                     osm: ['tourism', 'guest_house'] },
  { id: 'agencia-viagem',   g: 'turismo', pt: 'Agência de viagens',       en: 'Travel agency',              es: 'Agencia de viajes',          osm: ['shop', 'travel_agency'] },
];

export const PAISES = [
  ['br', 'Brasil'], ['us', 'Estados Unidos'], ['ca', 'Canadá'], ['gb', 'Reino Unido'], ['ie', 'Irlanda'],
  ['au', 'Austrália'], ['nz', 'Nova Zelândia'], ['pt', 'Portugal'], ['es', 'Espanha'], ['mx', 'México'],
  ['ar', 'Argentina'], ['cl', 'Chile'], ['co', 'Colômbia'], ['de', 'Alemanha'], ['fr', 'França'],
  ['it', 'Itália'], ['nl', 'Holanda'], ['ae', 'Emirados Árabes'],
];
const PAIS_OK = new Set(PAISES.map(([c]) => c));

const linguaDe = (pais) => ({ br: 'pt', pt: 'pt', es: 'es', mx: 'es', ar: 'es', cl: 'es', co: 'es' }[pais] || 'en');
const codigoLingua = (pais) => ({ br: 'pt-BR', pt: 'pt-PT', es: 'es', mx: 'es-419', ar: 'es-419', cl: 'es-419', co: 'es-419', de: 'de', fr: 'fr', it: 'it', nl: 'nl' }[pais] || 'en');

// Modo "Brasil inteiro": as dez maiores capitais, uma página cada.
const CAPITAIS = [
  ['São Paulo, SP', -23.5505, -46.6333], ['Rio de Janeiro, RJ', -22.9068, -43.1729], ['Brasília, DF', -15.7939, -47.8828],
  ['Salvador, BA', -12.9714, -38.5124], ['Fortaleza, CE', -3.7319, -38.5267], ['Belo Horizonte, MG', -19.9167, -43.9345],
  ['Manaus, AM', -3.1190, -60.0217], ['Curitiba, PR', -25.4284, -49.2733], ['Recife, PE', -8.0476, -34.8770], ['Porto Alegre, RS', -30.0346, -51.2177],
];

/* ---------- geocodificação (Nominatim) ---------- */

async function cidades(pais, q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', q);
  url.searchParams.set('countrycodes', pais);
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', codigoLingua(pais));
  const r = await buscar(url, { headers: { 'user-agent': UA } }, 8000);
  if (!r.ok) throw new Error('Nominatim ' + r.status);
  const lista = await r.json();
  const vistos = new Set();
  const saida = [];
  for (const x of lista) {
    const tipo = x.addresstype || x.type || '';
    if (!/city|town|village|municipality|suburb|county|state_district|administrative|hamlet|borough|quarter|neighbourhood|locality/.test(tipo)) continue;
    const a = x.address || {};
    const nome = x.name || a.city || a.town || a.village || a.municipality || '';
    if (!nome) continue;
    const estado = pais === 'br' ? (a['ISO3166-2-lvl4'] || '').replace('BR-', '') : (a.state || a.county || a.region || '');
    const rotulo = estado && estado !== nome ? `${nome}, ${estado}` : nome;
    if (vistos.has(rotulo)) continue;
    vistos.add(rotulo);
    saida.push({ rotulo, lat: Number(x.lat), lon: Number(x.lon) });
  }
  return saida;
}

async function geocodificar(cidade, pais) {
  const lista = await cidades(pais, cidade).catch(() => []);
  return lista[0] || null;
}

async function nomeDoLugar(lat, lon, pais) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat); url.searchParams.set('lon', lon);
    url.searchParams.set('zoom', '10');
    url.searchParams.set('accept-language', codigoLingua(pais));
    const r = await buscar(url, { headers: { 'user-agent': UA } }, 6000);
    const d = await r.json();
    const a = d.address || {};
    const nome = a.city || a.town || a.village || a.municipality || d.name || '';
    const estado = pais === 'br' ? (a['ISO3166-2-lvl4'] || '').replace('BR-', '') : (a.state || '');
    return nome ? (estado ? `${nome}, ${estado}` : nome) : 'perto de você';
  } catch (e) { return 'perto de você'; }
}

/* ---------- classificação e pontuação ---------- */

const REDES = /(^|\.)(instagram\.com|facebook\.com|fb\.com|m\.me|linkedin\.com|wa\.me|whatsapp\.com|linktr\.ee|beacons\.ai|bio\.site|t\.me|youtube\.com|tiktok\.com|x\.com|twitter\.com|ifood\.com\.br|goomer\.app|anota\.ai)$/i;

function classificar(n) {
  let site = n.site ? String(n.site).trim() : '';
  let insta = n.insta || n.redes?.instagram || n.redes?.facebook || '';
  let diretorio = '';
  if (site) {
    try {
      const host = new URL(/^https?:/i.test(site) ? site : 'https://' + site).hostname;
      if (REDES.test(host)) { insta = site; site = ''; }
      // Ficha de Yelp ou páginas amarelas no campo "site" não é site:
      // era daí que vinha negócio marcado como atendido sem ser.
      else if (ehDiretorio(site)) { diretorio = site; site = ''; }
    } catch (e) { site = ''; }
  }
  n.site = site || undefined;
  n.insta = insta || undefined;
  n.diretorio = diretorio || undefined;
  n.semSite = !site;
  n.soRede = !site && Boolean(insta || diretorio);
  n.semNada = !site && !insta && !diretorio;
  return n;
}

/* Pontuação com motivo. Cada sinal soma ou tira pontos e deixa
   registrado o porquê, para o cartão mostrar de onde veio o número.
   Antes era 70 fixo para quem não tinha site, e todo mundo empatava
   em 72 quando a fonte não trazia avaliação. */
export function pontuar(n) {
  const porque = [];
  const soma = (pontos, texto) => { porque.push({ pontos, texto }); return pontos; };
  const av = Number(n.avaliacoes) || 0;
  const nota = Number(n.nota) || 0;
  let s = 40;

  /* presença */
  if (n.semNada) s += soma(26, 'Sem site e sem rede: a venda mais fácil, é criar do zero');
  else if (n.diretorio) s += soma(22, 'O site do perfil é ficha de diretório (Yelp e parecidos), não é página própria');
  else if (n.soRede) s += soma(18, 'Só rede social: quem chega pelo Google não tem onde cair');
  else if (n.site) {
    const d = n.diag;
    if (d && d.nota != null) {
      if (d.nota < 40) s += soma(20, `Site com nota ${d.nota}: mais atrapalha do que ajuda`);
      else if (d.nota < 60) s += soma(12, `Site com nota ${d.nota}: dá para melhorar bastante`);
      else if (d.nota < 80) s += soma(5, `Site razoável (nota ${d.nota})`);
      else s += soma(-8, `Site bom (nota ${d.nota}): pouco a vender aqui`);
    } else s += soma(4, 'Tem site, ainda não avaliado');
  }
  if (n.verificado === 'nada') s += soma(4, 'Procurei na web e não achei site: confirmado');

  /* dá para falar com a pessoa? o site costuma ter o que o mapa não tem */
  const c = n.diag?.contatos || null;
  const temZap = Boolean(n.whatsapp || c?.zaps?.length);
  const temFone = Boolean(n.fone || c?.telefones?.length);
  const temMail = Boolean(n.email || c?.emails?.length);
  if (temZap) s += soma(6, 'Tem WhatsApp: abordagem direta');
  else if (temFone) s += soma(4, 'Tem telefone');
  else s += soma(-10, 'Sem telefone: difícil de alcançar');
  if (temMail) s += soma(2, 'Tem e-mail');
  if (c && (c.emails?.length || c.zaps?.length) && !n.fone) s += soma(3, 'O site tem contato que o mapa não trazia');

  /* demanda comprovada */
  if (av >= 150) s += soma(14, `${av} avaliações: movimento provado, orçamento existe`);
  else if (av >= 50) s += soma(10, `${av} avaliações: já atende bem`);
  else if (av >= 10) s += soma(5, `${av} avaliações`);
  else if (av > 0) s += soma(1, `Só ${av} avaliações`);
  if (nota && nota < 4) s += soma(5, `Nota ${nota}: reputação a recuperar, precisa de ajuda`);
  else if (nota >= 4.7 && av >= 20) s += soma(3, `Nota ${nota}: serviço bom, faltando vitrine`);

  /* perfil incompleto é sinal de abandono digital */
  if (n.fonte === 'google') {
    if (!n.horario) s += soma(3, 'Perfil do Google sem horário');
    if (n.fotos === 0) s += soma(3, 'Perfil do Google sem fotos');
    if (n.status && n.status !== 'OPERATIONAL') s += soma(-40, 'Consta como fechado no Google');
  } else if (!n.horario) s += soma(1, 'Sem horário cadastrado');

  /* porte, quando o site foi lido */
  if (n.diag?.porte === 'grande') s += soma(4, 'Tem equipe: orçamento maior');
  else if (n.diag?.porte === 'pequeno') s += soma(-3, 'Operação de uma pessoa: orçamento curto');

  n.porque = porque;
  return Math.max(5, Math.min(98, Math.round(s)));
}

/* ---------- perfil no Google: o que está bom, ruim ou falta ----------
   Só afirma o que a fonte sabe. O OpenStreetMap não tem foto nem
   avaliação, então esses itens ficam como "não dá para ver". */
export function perfilGoogle(n) {
  const itens = [];
  const add = (item, estado, texto) => itens.push({ item, estado, texto });
  const google = n.fonte === 'google';
  const nome = String(n.nome || '');

  if (!nome) add('Nome', 'falta', 'Sem nome cadastrado');
  else if (nome === nome.toUpperCase() && nome.length > 6) add('Nome', 'ruim', 'Nome todo em maiúsculas: o Google penaliza e parece gritado');
  else if (/[|]|melhor|top|nº ?1|n°1|#1|24h|promo/i.test(nome)) add('Nome', 'ruim', 'Nome com palavras a mais (o Google pode suspender por isso)');
  else add('Nome', 'bom', 'Nome limpo, do jeito que o cliente procura');

  if (n.tipo) add('Categoria', 'bom', `Categoria: ${n.tipo}`);
  else add('Categoria', 'falta', 'Sem categoria: não aparece nas buscas do nicho');

  if (n.end) add('Endereço', 'bom', 'Endereço completo');
  else add('Endereço', 'falta', 'Sem endereço: não aparece no mapa de verdade');

  if (n.whatsapp) add('Telefone', 'bom', 'WhatsApp cadastrado');
  else if (n.fone) add('Telefone', 'bom', 'Telefone cadastrado');
  else add('Telefone', 'falta', 'Sem telefone: o cliente não tem como ligar');

  if (n.site && n.diag?.nota != null && n.diag.nota < 50) add('Site', 'ruim', `Site ligado ao perfil, mas ele está em ${n.diag.nota} de 100`);
  else if (n.site) add('Site', 'bom', 'Site ligado ao perfil');
  else if (n.diretorio) add('Site', 'ruim', 'O endereço do perfil leva a uma ficha de diretório, não a um site');
  else if (n.achado?.site) add('Site', 'ruim', 'Existe site na web, mas o perfil não aponta pra ele');
  else if (n.insta) add('Site', 'ruim', 'No lugar do site, uma rede social');
  else add('Site', 'falta', 'Sem site: o botão "site" do Google fica vazio');

  if (n.horario) add('Horário', 'bom', 'Horário de funcionamento preenchido');
  else add('Horário', 'falta', google ? 'Sem horário: o Google mostra "horário não informado"' : 'Sem horário cadastrado');

  if (google) {
    const av = Number(n.avaliacoes) || 0, nota = Number(n.nota) || 0;
    if (!av) add('Avaliações', 'falta', 'Nenhuma avaliação: sem prova social');
    else if (av < 10) add('Avaliações', 'ruim', `Só ${av} avaliações`);
    else if (nota < 4) add('Avaliações', 'ruim', `${av} avaliações com nota ${nota}: reputação a cuidar`);
    else add('Avaliações', 'bom', `${av} avaliações, nota ${nota}`);

    if (n.fotos === 0) add('Fotos', 'falta', 'Sem fotos: perfil parece abandonado');
    else if (n.fotos < 5) add('Fotos', 'ruim', `Só ${n.fotos} fotos`);
    else add('Fotos', 'bom', `${n.fotos} fotos`);

    if (n.resumo) add('Descrição', 'bom', 'Tem descrição');
    else add('Descrição', 'falta', 'Sem descrição do negócio');

    if (n.status && n.status !== 'OPERATIONAL') add('Situação', 'ruim', 'Consta como fechado');
  } else {
    add('Avaliações', 'desconhecido', 'Avaliações e fotos não aparecem pelo OpenStreetMap; abra o Google para ver');
  }

  const faltas = itens.filter((i) => i.estado === 'falta').length;
  const ruins = itens.filter((i) => i.estado === 'ruim').length;
  const bons = itens.filter((i) => i.estado === 'bom').length;
  return { itens, faltas, ruins, bons };
}

const chaveDe = (n) => (String(n.nome || '') + '|' + String(n.end || '')).toLowerCase().slice(0, 180);

function fechar(lista, lugar, extra = {}) {
  const vistos = new Set();
  const limpa = [];
  const ctx = { nicho: extra.nichoId || '', grupo: extra.grupo || '', nichoNome: extra.nichoNome || extra.termo || '', cidade: lugar };
  for (const n of lista) {
    if (!n.nome) continue;
    const k = chaveDe(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    classificar(n);
    n.score = pontuar(n);
    n.perfil = perfilGoogle(n);
    n.plano = plano(n, ctx);
    limpa.push(n);
  }
  limpa.sort((a, b) => b.score - a.score || (b.avaliacoes || 0) - (a.avaliacoes || 0));
  return {
    lugar: { nome: lugar },
    total: limpa.length,
    semSite: limpa.filter((x) => x.semSite).length,
    comFone: limpa.filter((x) => x.fone).length,
    lista: limpa,
    ...extra,
  };
}

/* ---------- Google Places (New) ---------- */

const MASCARA = [
  'nextPageToken', 'places.id', 'places.displayName', 'places.formattedAddress',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.rating', 'places.userRatingCount', 'places.reviews', 'places.primaryTypeDisplayName',
  'places.googleMapsUri', 'places.regularOpeningHours', 'places.businessStatus', 'places.photos',
  'places.editorialSummary', 'places.types',
].join(',');

// Caixa em graus a partir do raio em metros (1° de latitude ≈ 111 km).
function caixa(lat, lon, raio) {
  const dLat = raio / 111000;
  const dLon = raio / (111000 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return { low: { latitude: lat - dLat, longitude: lon - dLon }, high: { latitude: lat + dLat, longitude: lon + dLon } };
}

async function paginaGoogle(corpo) {
  const r = await buscar('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': chaveGoogle(), 'x-goog-fieldmask': MASCARA },
    body: JSON.stringify(corpo),
  }, 20000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || ('Google respondeu ' + r.status));
  return d;
}

async function buscarGoogle({ termo, lat, lon, raio, pais, paginas = 3 }) {
  const corpo = {
    textQuery: termo,
    languageCode: codigoLingua(pais),
    regionCode: pais.toUpperCase(),
    pageSize: 20,
    locationRestriction: { rectangle: caixa(lat, lon, raio) },
  };
  const saida = [];
  let token = null;
  for (let i = 0; i < paginas; i++) {
    const d = await paginaGoogle(token ? { ...corpo, pageToken: token } : corpo);
    for (const p of d.places || []) {
      saida.push({
        nome: p.displayName?.text || '',
        end: p.formattedAddress || '',
        fone: p.nationalPhoneNumber || undefined,
        foneIntl: p.internationalPhoneNumber ? p.internationalPhoneNumber.replace(/\D/g, '') : undefined,
        site: p.websiteUri || undefined,
        nota: p.rating || undefined,
        avaliacoes: p.userRatingCount || undefined,
        opinioes: (p.reviews || []).map((r) => r.text?.text || r.originalText?.text || '').filter(Boolean).map((t) => t.slice(0, 280)).slice(0, 4),
        tipo: p.primaryTypeDisplayName?.text || undefined,
        tipos: p.types || [],
        horario: p.regularOpeningHours?.weekdayDescriptions?.length ? p.regularOpeningHours.weekdayDescriptions.join('; ') : undefined,
        fotos: Array.isArray(p.photos) ? p.photos.length : 0,
        status: p.businessStatus || undefined,
        resumo: p.editorialSummary?.text || undefined,
        redes: {},
        fonte: 'google',
        maps: p.googleMapsUri || undefined,
      });
    }
    token = d.nextPageToken;
    if (!token) break;
  }
  return saida;
}

/* ---------- OpenStreetMap (Overpass), sem chave ---------- */

/* O Overpass público limita por IP e devolve 429 quando está cheio,
   o que acontece fácil com nicho escrito à mão, que vira busca por
   nome (bem mais pesada que a tag). Tenta o principal e, se ele
   recusar ou cair, os espelhos. Erro de consulta (400) não adianta
   repetir em outro lugar. */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpass(q) {
  let ultimo = 0;
  for (const endereco of OVERPASS) {
    let r;
    try {
      r = await buscar(endereco, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
        body: 'data=' + encodeURIComponent(q),
      }, 20000);
    } catch { ultimo = 'tempo'; continue; }
    if (r.ok) return r.json();
    ultimo = r.status;
    if (r.status !== 429 && r.status < 500) break;
  }
  throw new Error(ultimo === 429 || ultimo === 'tempo' || ultimo >= 500
    ? 'O OpenStreetMap está recebendo buscas demais agora. Espere um minuto e tente de novo, ou ligue a chave do Google (GOOGLE_PLACES_KEY) na stack, que não tem esse limite.'
    : 'OpenStreetMap respondeu ' + ultimo);
}

/* Nicho escrito à mão vira busca por nome. Procurar em tudo que tem
   nome no raio (ruas, bairros, prédios) estoura o tempo do Overpass
   em qualquer servidor, e cada estouro conta contra a cota, que é
   de onde vinha o 429. Então: só entre o que já é comércio ou serviço,
   numa caixa em vez de círculo, com o acento opcional ("estetica"
   acha "Estética"). */
const ACENTOS = { a: 'aáàâã', e: 'eéê', i: 'ií', o: 'oóôõ', u: 'uúü', c: 'cç' };
function regexNome(termo) {
  const uma = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 &'-]/g, '').trim()
    .replace(/[aeiouc]/g, (l) => '[' + ACENTOS[l] + ']');
  // A barra separa sin\u00f4nimos: "calha/gutter" acha os dois.
  return String(termo).split('/').map(uma).filter(Boolean).join('|');
}
const CHAVES_NEGOCIO = ['shop', 'office', 'amenity', 'craft', 'healthcare', 'leisure'];

async function buscarOsm({ nicho, termo, lat, lon, raio }) {
  let q;
  // O nicho pode trazer uma tag (['craft','roofer']) ou várias.
  const tags = nicho?.osm ? (Array.isArray(nicho.osm[0]) ? nicho.osm : [nicho.osm]) : null;
  if (tags) {
    const dentro = tags.map(([k, v]) => `nwr["${k}"="${v}"](around:${Math.round(raio)},${lat},${lon});`).join('');
    q = `[out:json][timeout:25];(${dentro});out center tags 120;`;
  } else {
    const rx = regexNome(nicho?.osmNome || termo);
    if (!rx) return [];
    const { low, high } = caixa(lat, lon, raio);
    const bbox = [low.latitude, low.longitude, high.latitude, high.longitude].map((n) => n.toFixed(4)).join(',');
    const partes = CHAVES_NEGOCIO.map((k) => `nwr["${k}"]["name"~"${rx}",i];`).join('') + `nwr["cuisine"~"${rx}",i];`;
    q = `[out:json][timeout:25][bbox:${bbox}];(${partes});out center tags 120;`;
  }
  const d = await overpass(q);
  return (d.elements || []).map((e) => {
    const t = e.tags || {};
    const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
    const bairro = t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:district'] || '';
    const cidade = t['addr:city'] || '';
    const end = [rua, bairro, cidade].filter(Boolean).join(' - ') || (t['addr:full'] || '');
    const fone = t.phone || t['contact:phone'] || t['contact:mobile'] || undefined;
    const whatsapp = t['contact:whatsapp'] || undefined;
    // O OSM guarda a rede ora como link, ora como arroba: vira link sempre.
    const rede = (v, base) => v ? (/^https?:/i.test(v) ? v : base + String(v).replace(/^@/, '').replace(/\/+$/, '') + '/') : undefined;
    const redes = {
      instagram: rede(t['contact:instagram'], 'https://www.instagram.com/'),
      facebook: rede(t['contact:facebook'], 'https://www.facebook.com/'),
      linkedin: rede(t['contact:linkedin'], 'https://www.linkedin.com/company/'),
      youtube: rede(t['contact:youtube'], 'https://www.youtube.com/'),
      tiktok: rede(t['contact:tiktok'], 'https://www.tiktok.com/@'),
      x: rede(t['contact:twitter'] || t['contact:x'], 'https://x.com/'),
    };
    for (const k of Object.keys(redes)) if (!redes[k]) delete redes[k];
    return {
      nome: t.name || '',
      end,
      fone,
      foneIntl: fone ? fone.replace(/\D/g, '') : undefined,
      whatsapp,
      email: t.email || t['contact:email'] || undefined,
      site: t.website || t['contact:website'] || t.url || undefined,
      insta: redes.instagram || redes.facebook,
      redes,
      horario: t.opening_hours || undefined,
      tipo: t.cuisine || t.healthcare || t.craft || t.shop || t.amenity || t.office || undefined,
      // o que a fonte sabe dizer: serve pro diagnóstico do perfil não inventar
      fonte: 'osm',
      maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((t.name || '') + ' ' + end)}`,
    };
  });
}

/* ---------- a varredura ---------- */

async function varrer(url) {
  const p = url.searchParams;
  const pais = PAIS_OK.has(p.get('pais')) ? p.get('pais') : 'br';
  const lingua = linguaDe(pais);
  const nicho = NICHOS.find((n) => n.id === p.get('nicho')) || null;
  const termoLivre = String(p.get('termo') || '').trim().slice(0, 60);
  if (!nicho && !termoLivre) return { erro: 'Escolha um nicho ou escreva um.' };
  const termo = nicho ? (nicho[lingua] || nicho.en) : termoLivre;
  const raio = Math.min(30000, Math.max(2000, Number(p.get('raio')) || 12000));
  const modo = p.get('modo') || 'cidade';
  const usaGoogle = Boolean(chaveGoogle());
  const fonte = usaGoogle ? 'google' : 'osm';

  const buscarEm = (lat, lon, r, paginas) => usaGoogle
    ? buscarGoogle({ termo, lat, lon, raio: r, pais, paginas })
    : buscarOsm({ nicho: nicho || null, termo, lat, lon, raio: r });

  if (modo === 'brasil') {
    const partes = [];
    // Três praças por vez: o Overpass barra mais que isso, e o Google não precisa de mais.
    for (let i = 0; i < CAPITAIS.length; i += 3) {
      const fatia = CAPITAIS.slice(i, i + 3);
      const res = await Promise.allSettled(fatia.map(([nome, lat, lon]) => buscarEm(lat, lon, 12000, 1).then((l) => l.map((x) => ({ ...x, praca: nome })))));
      for (const r of res) if (r.status === 'fulfilled') partes.push(...r.value);
    }
    return fechar(partes, 'Brasil · 10 capitais', { pracas: CAPITAIS.length, fonte, termo, ...doNicho(nicho) });
  }

  // Number(null) é zero, não NaN: sem esse cuidado, cidade digitada
  // sem escolher da lista ia varrer o meio do Atlântico e voltar vazia.
  const numero = (v) => (v == null || v === '' ? NaN : Number(v));
  let lat = numero(p.get('lat')), lon = numero(p.get('lon'));
  let lugar = String(p.get('cidade') || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (!lugar) return { erro: 'Informe a cidade.' };
    const g = await geocodificar(lugar, pais);
    if (!g) return { erro: `Não achei "${lugar}". Escolha uma cidade da lista.` };
    lat = g.lat; lon = g.lon; lugar = g.rotulo;
  } else if (!lugar) {
    lugar = await nomeDoLugar(lat, lon, pais);
  }

  const lista = await buscarEm(lat, lon, raio, 3);
  return fechar(lista, lugar, { fonte, termo, lat, lon, raio, ...doNicho(nicho) });
}

/* O nicho escolhido viaja junto com o resultado: é dele que saem os
   blocos do "o que recriar" e o texto da mensagem. */
const doNicho = (nicho) => nicho ? { nichoId: nicho.id, grupo: nicho.g, nichoNome: nicho.pt } : {};

/* ---------- mensagem com Claude ---------- */

const SISTEMA_PT = `Você escreve mensagens curtas de primeiro contato para um designer que vende sites e páginas para negócios locais. A mensagem vai por WhatsApp para o dono do negócio, que nunca ouviu falar do designer.

Estrutura obrigatória, nesta ordem, sem títulos:
1. O que eu vi: um detalhe concreto e verificável do negócio (nome como a vizinhança chama, bairro, avaliações, o que falta ou o que está errado no site).
2. O que isso custa: em uma frase, o cliente que ele perde por causa disso. Sem catastrofismo.
3. O que eu já fiz: o designer já preparou algo (uma página, uma primeira tela) e vai mandar. Entrega antes da oferta.
4. Fecho sem pedir permissão: ele manda o link ainda hoje; não pergunta "posso?".

Regras: até 90 palavras. Tom de gente, direto, sem "espero que esteja bem", sem "gostaria de apresentar", sem lista, sem emoji, sem hashtag, sem travessão (use vírgula ou ponto). Uma saudação curta no começo. Assina com o primeiro nome do designer no fim. Não invente números que não estão nos dados. Quando houver opiniões de clientes, use uma expressão real delas, curta, entre aspas. Responda só com a mensagem.`;

const SISTEMA_EN = `You write short first-contact emails for a designer who sells websites and landing pages to local businesses. The recipient is the business owner, who has never heard of the designer.

Required structure, in this order, no headings:
1. What I saw: one concrete, verifiable detail about the business (how locals call it, neighborhood, reviews, what's missing or broken on the site).
2. What it costs: one sentence about the customer they lose because of it. No drama.
3. What I already did: the designer has already prepared something (a page, a first screen) and will send it. Delivery before the offer.
4. Close without asking permission: they'll send the link today; never ask "may I?".

Rules: 100 words max. Start with a subject line ("Subject: …"), then a short greeting. Human, direct; no "hope this finds you well", no bullet lists, no emoji, no em dashes (use a comma or a period). Sign with the designer's first name. Don't invent numbers not present in the data. If customer reviews are given, quote one short real expression from them. Reply with the email only.`;

async function mensagemIa(dado) {
  if (!chaveClaude()) return { semChave: true };
  const idioma = dado.idioma === 'en' ? 'en' : 'pt';
  const contexto = {
    negocio: dado.nome, categoria: dado.tipo || dado.nicho, bairro: dado.bairro, cidade: dado.cidade,
    nota: dado.nota, avaliacoes: dado.avaliacoes,
    site: dado.site || null,
    soRedeSocial: Boolean(dado.rede),
    problemasDoSite: (dado.problemas || []).slice(0, 6),
    opinioesDeClientes: (dado.opinioes || []).slice(0, 4),
    designer: { nome: dado.euNome, oQueFaz: dado.euFaz, cidade: dado.euCidade },
    variacao: Number(dado.variacao) || 1,
  };
  const pedido = idioma === 'en'
    ? `Business data (JSON):\n${JSON.stringify(contexto, null, 2)}\n\nWrite variation #${contexto.variacao}, a different angle from the previous ones.`
    : `Dados do negócio (JSON):\n${JSON.stringify(contexto, null, 2)}\n\nEscreva a variação nº ${contexto.variacao}, com um ângulo diferente das anteriores.`;

  const r = await buscar('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chaveClaude(),
      'anthropic-version': '2023-06-01',
      // Se um classificador barrar o pedido, o próprio servidor da
      // Anthropic reencaminha para outro modelo em vez de devolver recusa.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      fallbacks: 'default',
      max_tokens: 1024,
      output_config: { effort: 'medium' },
      system: idioma === 'en' ? SISTEMA_EN : SISTEMA_PT,
      messages: [{ role: 'user', content: pedido }],
    }),
  }, 90000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || ('Claude respondeu ' + r.status));
  if (d.stop_reason === 'refusal') throw new Error('O modelo recusou escrever esta mensagem.');
  const texto = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    .replace(/\s*[—–]\s*/g, ', ');   // regra do projeto: nada de travessão na tela
  if (!texto) throw new Error('Veio uma resposta vazia.');
  return { texto };
}

/* ---------- Instagram via Serper ---------- */

function lerSeguidores(s) {
  const m = String(s || '').match(/([\d.,]+)\s*([kKmM]|mil|mi|milhões|million)?\s*(followers|seguidores)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) n = parseFloat(m[1].replace(',', ''));
  const suf = (m[2] || '').toLowerCase();
  if (suf === 'k' || suf === 'mil') n *= 1000;
  if (suf === 'm' || suf === 'mi' || suf.startsWith('milh') || suf === 'million') n *= 1000000;
  return Math.round(n);
}

function faixaDe(seg, bio) {
  const porques = [];
  const b = (bio || '').toLowerCase();
  let pontos = 0;
  if (seg == null) porques.push('não mostra seguidores');
  else if (seg < 300) { porques.push('público muito pequeno'); pontos -= 2; }
  else if (seg > 150000) { porques.push('grande demais, tem time'); pontos -= 2; }
  else if (seg >= 1500) { porques.push('já tem audiência'); pontos += 1; }
  if (/agend|whatsapp|orçamento|orcamento|atendimento|consult|book|appointment|📍|horário/.test(b)) { porques.push('já atende e cobra'); pontos += 2; }
  if (/\b(cro|crm|crp|oab|crn|cref|crefito|crmv|crc)\b/i.test(b)) { porques.push('profissional registrado'); pontos += 2; }
  if (/link|site|\.com|bio\.site|linktr/.test(b)) { porques.push('já manda pra um link'); pontos += 0; }
  if (/loja|delivery|entrega|pedido/.test(b)) { porques.push('vende produto'); pontos += 1; }
  if (!porques.some((x) => /atende|registrado|vende|audiência/.test(x))) porques.push('sem sinal claro de que vende');
  const faixa = pontos >= 2 ? 'no ponto' : pontos >= 0 ? 'talvez' : 'não vale';
  return { faixa, porques };
}

async function instagram(termo, cidade) {
  if (!chaveSerper()) return { semChave: true, total: 0, comSeguidores: 0, lista: [] };
  const q = `site:instagram.com ${termo} ${cidade}`.trim();
  const r = await buscar('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': chaveSerper() },
    body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 40 }),
  }, 15000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || ('Serper respondeu ' + r.status));
  const lista = [];
  const vistos = new Set();
  for (const o of d.organic || []) {
    const m = String(o.link || '').match(/instagram\.com\/([A-Za-z0-9_.]{2,40})\/?(\?|$)/);
    if (!m) continue;
    const arroba = m[1].toLowerCase();
    if (['p', 'reel', 'reels', 'explore', 'stories', 'accounts'].includes(arroba) || vistos.has(arroba)) continue;
    vistos.add(arroba);
    const titulo = String(o.title || '');
    const nome = titulo.replace(/\s*\(@[^)]+\).*$/, '').replace(/\s*[•|·-]\s*Instagram.*$/i, '').trim() || arroba;
    const snippet = String(o.snippet || '');
    const seguidores = lerSeguidores(snippet);
    const bio = snippet.replace(/^.*?(followers|seguidores)[^-–]*[-–]\s*/i, '').replace(/See Instagram photos.*$/i, '').replace(/Veja (as )?fotos.*$/i, '').trim();
    const { faixa, porques } = faixaDe(seguidores, bio + ' ' + titulo);
    lista.push({ nome, arroba, seguidores, bio, link: `https://www.instagram.com/${arroba}/`, faixa, porques });
  }
  const ordem = { 'no ponto': 0, talvez: 1, 'não vale': 2 };
  lista.sort((a, b) => ordem[a.faixa] - ordem[b.faixa] || (b.seguidores || 0) - (a.seguidores || 0));
  return { total: lista.length, comSeguidores: lista.filter((x) => x.seguidores != null).length, lista };
}

/* ---------- vagas ---------- */

const DESIGN = /design|designer|ux|ui\b|product design|figma|webflow|framer|brand|visual|graphic|motion|creative|illustrat/i;

const tira = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const resumo = (s) => tira(s).slice(0, 220);
const dataIso = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

async function vagasRemotive(termo) {
  const url = new URL('https://remotive.com/api/remote-jobs');
  url.searchParams.set('category', 'design');
  if (termo) url.searchParams.set('search', termo);
  const d = await (await buscar(url, { headers: { 'user-agent': UA } }, 12000)).json();
  return (d.jobs || []).map((j) => ({
    cargo: j.title, empresa: j.company_name, local: j.candidate_required_location || 'Remoto',
    salario: j.salary || '', data: dataIso(j.publication_date), link: j.url, resumo: resumo(j.description),
    fonte: 'Remotive', remoto: true,
  }));
}

async function vagasRemoteOk(termo) {
  const d = await (await buscar('https://remoteok.com/api?tags=design', { headers: { 'user-agent': UA, accept: 'application/json' } }, 12000)).json();
  const t = (termo || '').toLowerCase();
  return (Array.isArray(d) ? d : []).filter((j) => j && j.position).filter((j) => !t || (j.position + ' ' + (j.tags || []).join(' ')).toLowerCase().includes(t)).map((j) => ({
    cargo: j.position, empresa: j.company, local: j.location || 'Remoto',
    salario: j.salary_min && j.salary_max ? `$${j.salary_min} a $${j.salary_max}` : '',
    data: dataIso(j.date), link: j.url, resumo: resumo(j.description), fonte: 'RemoteOK', remoto: true,
  }));
}

async function vagasWwr(termo) {
  const xml = await (await buscar('https://weworkremotely.com/categories/remote-design-jobs.rss', { headers: { 'user-agent': UA } }, 12000)).text();
  const itens = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const campo = (s, n) => { const m = s.match(new RegExp('<' + n + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + n + '>')); return m ? m[1].trim() : ''; };
  const t = (termo || '').toLowerCase();
  return itens.map((s) => {
    const titulo = tira(campo(s, 'title'));
    const [empresa, ...resto] = titulo.split(': ');
    return {
      cargo: resto.length ? resto.join(': ') : titulo, empresa: resto.length ? empresa : '',
      local: tira(campo(s, 'region')) || 'Remoto', salario: '',
      data: dataIso(campo(s, 'pubDate')), link: campo(s, 'link'), resumo: resumo(campo(s, 'description')),
      fonte: 'WeWorkRemotely', remoto: true,
    };
  }).filter((j) => !t || j.cargo.toLowerCase().includes(t));
}

async function vagasHimalayas(termo) {
  const url = new URL('https://himalayas.app/jobs/api');
  url.searchParams.set('limit', '100');
  url.searchParams.set('q', termo || 'designer');
  const d = await (await buscar(url, { headers: { 'user-agent': UA } }, 12000)).json();
  return (d.jobs || []).map((j) => ({
    cargo: j.title, empresa: j.companyName, local: (j.locationRestrictions || []).join(', ') || 'Remoto',
    salario: j.minSalary && j.maxSalary ? `$${j.minSalary} a $${j.maxSalary}` : '',
    data: dataIso(j.pubDate ? j.pubDate * 1000 : j.publishedDate), link: j.applicationLink, resumo: resumo(j.excerpt || j.description),
    fonte: 'Himalayas', remoto: true,
  }));
}

async function vagas(termo) {
  const fontes = [vagasRemotive, vagasRemoteOk, vagasWwr, vagasHimalayas];
  const res = await Promise.allSettled(fontes.map((f) => f(termo)));
  const vistos = new Set();
  const lista = [];
  const ativas = [];
  res.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    ativas.push(['Remotive', 'RemoteOK', 'WeWorkRemotely', 'Himalayas'][i]);
    for (const v of r.value) {
      if (!v.cargo || !DESIGN.test(v.cargo + ' ' + (v.resumo || ''))) continue;
      const k = (v.cargo + '|' + v.empresa).toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      lista.push(v);
    }
  });
  lista.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return { total: lista.length, comSalario: lista.filter((v) => v.salario).length, fontes: ativas, lista };
}

/* ---------- perfil e leads (no volume) ---------- */

let cacheLeads = null;
let cachePerfil = null;

async function gravarJson(destino, dado) {
  await fs.mkdir(PASTA, { recursive: true });
  const tmp = destino + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(dado, null, 2), 'utf8');
  await fs.rename(tmp, destino);
}

async function lerPerfil() {
  if (cachePerfil) return cachePerfil;
  try { cachePerfil = JSON.parse(await fs.readFile(ARQ_PERFIL, 'utf8')); }
  catch (e) { cachePerfil = { nome: 'Samuel Freire', faz: 'sites', cidade: '', zap: '' }; }
  return cachePerfil;
}

async function gravarPerfil(p) {
  const limpo = {
    nome: String(p.nome || '').slice(0, 80),
    faz: String(p.faz || 'sites').slice(0, 40),
    cidade: String(p.cidade || '').slice(0, 80),
    zap: String(p.zap || '').slice(0, 30),
  };
  await gravarJson(ARQ_PERFIL, limpo);
  cachePerfil = limpo;
  return limpo;
}

const ESTADOS = ['mira', 'abordado', 'respondeu', 'proposta', 'fechado', 'descartado'];

async function lerLeads() {
  if (cacheLeads) return cacheLeads;
  try { cacheLeads = JSON.parse(await fs.readFile(ARQ_LEADS, 'utf8')); }
  catch (e) { cacheLeads = []; }
  if (!Array.isArray(cacheLeads)) cacheLeads = [];
  return cacheLeads;
}

async function salvarLeads(lista) {
  cacheLeads = lista;
  await gravarJson(ARQ_LEADS, lista);
}

function limparLead(l) {
  const s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
  return {
    chave: s(l.chave, 180), nome: s(l.nome, 120), endereco: s(l.endereco, 200), fone: s(l.fone, 40), foneIntl: s(l.foneIntl, 20),
    site: s(l.site, 300), insta: s(l.insta, 300), maps: s(l.maps, 400),
    email: s(l.email, 120), whatsapp: s(l.whatsapp, 60),
    nota: Number(l.nota) || null, avaliacoes: Number(l.avaliacoes) || null, score: Number(l.score) || null,
    cidade: s(l.cidade, 80), pais: s(l.pais, 2) || 'br', origem: s(l.origem, 20) || 'mapa',
    situacao: s(l.situacao, 60), entrega: s(l.entrega, 60),
  };
}

async function criarLead(bruto) {
  const leads = await lerLeads();
  const l = limparLead(bruto);
  if (!l.nome) throw new Error('Lead sem nome.');
  if (!l.chave) l.chave = (l.nome + '|' + l.endereco).toLowerCase().slice(0, 180);
  const existente = leads.find((x) => x.chave === l.chave);
  if (existente) return { lead: existente, jaExistia: true };
  const agora = new Date().toISOString();
  const novo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...l, estado: 'mira', anotacao: '', ultimo_toque: null, criado_em: agora, alterado_em: agora };
  leads.unshift(novo);
  await salvarLeads(leads);
  return { lead: novo };
}

async function alterarLead(id, mudancas) {
  const leads = await lerLeads();
  const l = leads.find((x) => x.id === id);
  if (!l) return null;
  if (mudancas.estado !== undefined) {
    if (!ESTADOS.includes(mudancas.estado)) throw new Error('Estado inválido.');
    if (mudancas.estado !== l.estado && mudancas.estado !== 'mira' && mudancas.estado !== 'descartado' && !l.ultimo_toque) l.ultimo_toque = new Date().toISOString();
    if (mudancas.estado === 'abordado' && l.estado !== 'abordado') l.ultimo_toque = new Date().toISOString();
    l.estado = mudancas.estado;
  }
  if (mudancas.anotacao !== undefined) l.anotacao = String(mudancas.anotacao).slice(0, 4000);
  if (mudancas.ultimo_toque !== undefined) l.ultimo_toque = mudancas.ultimo_toque ? new Date(mudancas.ultimo_toque).toISOString() : null;
  l.alterado_em = new Date().toISOString();
  await salvarLeads(leads);
  return l;
}

async function apagarLead(id) {
  const leads = await lerLeads();
  const i = leads.findIndex((x) => x.id === id);
  if (i < 0) return false;
  leads.splice(i, 1);
  await salvarLeads(leads);
  return true;
}

/* ---------- o roteador ---------- */

export function configuracao() {
  return {
    mapas: chaveGoogle() ? 'google' : 'osm',
    ia: Boolean(chaveClaude()),
    instagram: Boolean(chaveSerper()),
    pagespeedKey: chavePageSpeed(),
    nichos: NICHOS.map(({ id, g, pt, en }) => ({ id, g, pt, en })),
    grupos: GRUPOS,
    paises: PAISES,
  };
}

export async function apiProspeccao(req, res, url, rota) {
  const m = req.method;
  try {
    if (rota === 'config' && m === 'GET') return json(res, configuracao());

    if (rota === 'cidades' && m === 'GET') {
      const pais = PAIS_OK.has(url.searchParams.get('pais')) ? url.searchParams.get('pais') : 'br';
      const q = String(url.searchParams.get('q') || '').trim();
      if (q.length < 3) return json(res, { cidades: [] });
      return json(res, { cidades: await cidades(pais, q.slice(0, 80)) });
    }

    if (rota === 'buscar' && m === 'GET') {
      const d = await varrer(url);
      return json(res, d, d.erro ? 400 : 200);
    }

    if (rota === 'verificar' && m === 'GET') {
      const nome = String(url.searchParams.get('nome') || '').trim().slice(0, 120);
      if (nome.length < 3) return json(res, { erro: 'Informe o nome.' }, 400);
      return json(res, await verificarSite({ nome, cidade: url.searchParams.get('cidade') || '', pais: url.searchParams.get('pais') || '' }));
    }

    if (rota === 'traduzir' && m === 'POST') {
      const dado = await lerCorpoJson(req);
      const d = await traduzir(dado.texto, dado.de || 'pt', dado.para || 'en');
      return json(res, d, d.erro ? 502 : 200);
    }

    if (rota === 'pontuar' && m === 'POST') {
      // o navegador reenvia o negócio com o diagnóstico do site e a
      // verificação, e recebe a nota, os motivos, o perfil do Google
      // e o plano do que recriar, tudo recalculado com o que já sabe
      const dado = await lerCorpoJson(req);
      const n = dado.negocio || dado;
      const s = pontuar(n);
      const p = perfilGoogle(n);
      return json(res, { score: s, porque: n.porque || [], perfil: p, plano: plano({ ...n, perfil: p }, dado.ctx || {}) });
    }

    if (rota === 'site' && m === 'GET') {
      const alvo = normalizarUrl(url.searchParams.get('url'));
      if (!alvo) return json(res, { erro: 'Endereço inválido.' }, 400);
      return json(res, await diagnosticar(alvo));
    }

    if (rota === 'mensagem' && m === 'POST') {
      const dado = await lerCorpoJson(req);
      return json(res, await mensagemIa(dado));
    }

    if (rota === 'instagram' && m === 'GET') {
      const termo = String(url.searchParams.get('termo') || '').trim().slice(0, 60);
      const cidade = String(url.searchParams.get('cidade') || '').trim().slice(0, 60);
      if (!termo) return json(res, { erro: 'Diga o que procura.' }, 400);
      return json(res, await instagram(termo, cidade));
    }

    if (rota === 'vagas' && m === 'GET') {
      return json(res, await vagas(String(url.searchParams.get('termo') || '').trim().slice(0, 60)));
    }

    if (rota === 'perfil') {
      if (m === 'GET') return json(res, await lerPerfil());
      if (m === 'PUT') return json(res, await gravarPerfil(await lerCorpoJson(req, 8192)));
    }

    if (rota === 'leads') {
      if (m === 'GET') return json(res, { leads: await lerLeads() });
      if (m === 'POST') return json(res, { ok: true, ...(await criarLead(await lerCorpoJson(req, 16384))) });
    }

    if (rota.startsWith('leads/')) {
      const id = rota.slice('leads/'.length);
      if (!/^[a-z0-9]{6,24}$/.test(id)) return json(res, { erro: 'Lead inválido.' }, 400);
      if (m === 'PUT') {
        const l = await alterarLead(id, await lerCorpoJson(req, 16384));
        return l ? json(res, { ok: true, lead: l }) : json(res, { erro: 'Lead não encontrado.' }, 404);
      }
      if (m === 'DELETE') return (await apagarLead(id)) ? json(res, { ok: true }) : json(res, { erro: 'Lead não encontrado.' }, 404);
    }

    return json(res, { erro: 'Rota não existe.' }, 404);
  } catch (e) {
    if (e instanceof SyntaxError) return json(res, { erro: 'JSON inválido.' }, 400);
    if (e.message === 'grande') return json(res, { erro: 'Conteúdo grande demais.' }, 413);
    const tempo = e.name === 'AbortError';
    console.error('prospeccao:', rota, e.message);
    return json(res, { erro: tempo ? 'A fonte externa demorou demais. Tente de novo.' : (e.message || 'Erro interno.') }, 502);
  }
}
