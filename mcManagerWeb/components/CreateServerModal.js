import { useState } from 'react';
import { useConfig } from '../lib/config-context';
import { normalizeSubdomain } from '../lib/utils';
import { Plus, Trash2, Globe, Wifi } from 'lucide-react';

function CreateServerModal({ onClose, onCreate }) {
  const { mcDomain, baseDomain } = useConfig();

  const [formData, setFormData] = useState({
    name: '',
    subdomain: '',
    serverType: 'paper',
    minecraftVersion: 'latest',
    javaVersion: '21',
    maxRam: 2048,
    minRam: 1024,
    additionalServices: []
  });

  // Template servizi comuni (per quick add)
  const serviceTemplates = [
    { subdomain: 'dynmap', port: 8123, description: 'Dynmap web map', enableSsl: true },
    { subdomain: 'bluemap', port: 8100, description: 'BlueMap 3D map', enableSsl: true },
    { subdomain: 'map', port: 8080, description: 'SquareMap', enableSsl: true },
    { subdomain: 'plan', port: 8804, description: 'Plan analytics', enableSsl: true },
    { subdomain: '', port: 24454, description: 'Voice Chat (UDP)', enableSsl: false },
    { subdomain: '', port: 19132, description: 'Geyser (Bedrock)', enableSsl: false },
  ];

  // Tipi di server Minecraft disponibili
  const serverTypes = [
    { id: 'vanilla', name: 'Vanilla', desc: 'Server ufficiale Mojang' },
    { id: 'paper', name: 'Paper', desc: 'Ottimizzato per performance' },
    { id: 'spigot', name: 'Spigot', desc: 'Supporto plugin Bukkit' },
    { id: 'fabric', name: 'Fabric', desc: 'Moderno, leggero, moddabile' },
    { id: 'forge', name: 'Forge', desc: 'Supporto mod più diffuso' },
    { id: 'purpur', name: 'Purpur', desc: 'Fork di Paper con più features' },
    { id: 'velocity', name: 'Velocity', desc: 'Proxy moderno' },
    { id: 'waterfall', name: 'Waterfall', desc: 'Fork di BungeeCord' },
  ];

  // Versioni Java disponibili
  const javaVersions = [
    { id: '8', name: 'Java 8', desc: 'Per Minecraft 1.12 e precedenti' },
    { id: '11', name: 'Java 11', desc: 'Per Minecraft 1.13-1.16' },
    { id: '17', name: 'Java 17', desc: 'Per Minecraft 1.17-1.19' },
    { id: '21', name: 'Java 21', desc: 'Per Minecraft 1.20+' },
  ];

  // Auto-genera subdomain quando cambia il nome
  const handleNameChange = (e) => {
    const newName = e.target.value;
    const generatedSubdomain = normalizeSubdomain(newName);
    setFormData({
      ...formData,
      name: newName,
      subdomain: generatedSubdomain
    });
  };

  // Aggiungi servizio vuoto
  const addService = () => {
    setFormData({
      ...formData,
      additionalServices: [
        ...formData.additionalServices,
        { subdomain: '', port: '', description: '', enabled: true, enableSsl: false }
      ]
    });
  };

  // Aggiungi da template
  const addFromTemplate = (template) => {
    setFormData({
      ...formData,
      additionalServices: [
        ...formData.additionalServices,
        { ...template, enabled: true }
      ]
    });
  };

  // Rimuovi servizio
  const removeService = (index) => {
    const newServices = formData.additionalServices.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      additionalServices: newServices
    });
  };

  // Aggiorna servizio
  const updateService = (index, field, value) => {
    const newServices = [...formData.additionalServices];
    newServices[index] = { ...newServices[index], [field]: value };
    setFormData({
      ...formData,
      additionalServices: newServices
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Inserisci un nome per il server');
      return;
    }
    if (!formData.subdomain.trim()) {
      alert('Inserisci un sottodominio per il server');
      return;
    }

    // Converti additionalServices in additionalPorts per il backend
    const additionalPorts = {};
    formData.additionalServices.forEach((service, index) => {
      if (service.enabled && service.port) {
        const serviceKey = service.subdomain || `service${index}`;
        additionalPorts[serviceKey] = {
          port: parseInt(service.port),
          subdomain: service.subdomain || null,
          description: service.description || '',
          enableSsl: service.enableSsl || false
        };
      }
    });

    const serverData = {
      ...formData,
      additionalPorts,
      additionalServices: undefined // Rimuovi dal payload
    };

    onCreate(serverData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Crea Nuovo Server</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome Server *</label>
            <input
              type="text"
              value={formData.name}
              onChange={handleNameChange}
              placeholder="Il mio server Minecraft"
              required
            />
          </div>

          <div className="form-group">
            <label>Sottodominio *</label>
            <input
              type="text"
              value={formData.subdomain}
              onChange={e => setFormData({...formData, subdomain: normalizeSubdomain(e.target.value)})}
              placeholder="es: survival, creative, minigames"
              required
            />
            <small>
              Il server sarà raggiungibile su <strong>{formData.subdomain || 'sottodominio'}.{mcDomain}</strong>
            </small>
          </div>

          <div className="form-group">
            <label>Tipo Server *</label>
            <select
              value={formData.serverType}
              onChange={e => setFormData({...formData, serverType: e.target.value})}
              required
            >
              {serverTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name} - {type.desc}
                </option>
              ))}
            </select>
            <small>Il JAR verrà scaricato automaticamente da itzg/minecraft-server</small>
          </div>

          <div className="form-group">
            <label>Versione Minecraft</label>
            <input
              type="text"
              value={formData.minecraftVersion}
              onChange={e => setFormData({...formData, minecraftVersion: e.target.value})}
              placeholder="latest, 1.20.4, 1.19.4, etc."
            />
            <small>Usa "latest" per l'ultima versione disponibile, oppure specifica una versione (es: 1.20.4)</small>
          </div>

          <div className="form-group">
            <label>Versione Java *</label>
            <select
              value={formData.javaVersion}
              onChange={e => setFormData({...formData, javaVersion: e.target.value})}
              required
            >
              {javaVersions.map(java => (
                <option key={java.id} value={java.id}>
                  {java.name} - {java.desc}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>RAM Min (MB)</label>
              <input
                type="number"
                value={formData.minRam}
                onChange={e => setFormData({...formData, minRam: parseInt(e.target.value)})}
                min="512"
                step="256"
              />
            </div>
            <div className="form-group">
              <label>RAM Max (MB)</label>
              <input
                type="number"
                value={formData.maxRam}
                onChange={e => setFormData({...formData, maxRam: parseInt(e.target.value)})}
                min="1024"
                step="256"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Servizi Aggiuntivi (opzionali)</label>

            {formData.additionalServices.length > 0 && (
              <div className="services-editor-container">
                {formData.additionalServices.map((service, index) => (
                  <div key={index} className="service-editor-grid">
                    <input
                      type="checkbox"
                      checked={service.enabled}
                      onChange={(e) => updateService(index, 'enabled', e.target.checked)}
                      className="service-checkbox"
                    />
                    <input
                      type="text"
                      value={service.subdomain}
                      onChange={(e) => updateService(index, 'subdomain', e.target.value)}
                      placeholder="subdomain (opzionale)"
                      className="service-input"
                      disabled={!service.enabled}
                    />
                    <input
                      type="number"
                      value={service.port}
                      onChange={(e) => updateService(index, 'port', e.target.value)}
                      placeholder="Porta"
                      className="service-port-input"
                      disabled={!service.enabled}
                    />
                    <input
                      type="text"
                      value={service.description}
                      onChange={(e) => updateService(index, 'description', e.target.value)}
                      placeholder="Descrizione"
                      className="service-input"
                      disabled={!service.enabled}
                    />
                    <div className="service-ssl-container">
                      <input
                        type="checkbox"
                        checked={service.enableSsl || false}
                        onChange={(e) => updateService(index, 'enableSsl', e.target.checked)}
                        disabled={!service.enabled || !service.subdomain}
                        className="service-checkbox"
                        title="Abilita SSL/HTTPS"
                      />
                      <span className="service-ssl-label">SSL</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeService(index)}
                      className="service-delete-btn"
                    >
                      <Trash2 size={14} />
                    </button>
                    {service.enabled && baseDomain && (
                      <div className="service-url-preview">
                        {service.subdomain ? (
                          <>
                            <Globe size={12} />
                            {service.enableSsl
                              ? `https://${service.subdomain}-${formData.subdomain || 'server'}.${baseDomain}`
                              : `http://${service.subdomain}-${formData.subdomain || 'server'}.${baseDomain}`
                            }
                          </>
                        ) : (
                          <>
                            <Wifi size={12} />
                            {`${baseDomain}:${service.port}`}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="service-actions-container">
              <button
                type="button"
                onClick={addService}
                className="btn btn-secondary service-add-btn"
              >
                <Plus size={16} />
                Aggiungi Servizio Custom
              </button>

              <select
                onChange={(e) => {
                  if (e.target.value) {
                    const template = serviceTemplates[parseInt(e.target.value)];
                    addFromTemplate(template);
                    e.target.value = '';
                  }
                }}
                className="service-template-dropdown"
              >
                <option value="">Quick Add...</option>
                {serviceTemplates.map((template, i) => (
                  <option key={i} value={i}>
                    {template.description} ({template.subdomain || 'UDP'} : {template.port})
                  </option>
                ))}
              </select>
            </div>

            <small className="service-help-text">
              • <strong>Subdomain</strong>: lascia vuoto per porte UDP (Voice Chat, Geyser)<br />
              • <strong>Porta</strong>: porta interna del container<br />
              • Dovrai installare manualmente i plugin/mod richiesti
            </small>
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary">
              Crea Server
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateServerModal;
